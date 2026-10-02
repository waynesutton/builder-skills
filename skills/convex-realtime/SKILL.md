---
name: convex-realtime
description: "Builds reactive UIs on Convex subscriptions: useQuery patterns, optimistic updates, pagination that stays live, presence, and avoiding subscription churn. Use when wiring the frontend to Convex, when data does not update live, or when a page rerenders too much."
---

# Convex realtime

Every `useQuery` is a live subscription. The one rule: keep the set of documents a query reads small and indexed, because that read set decides when the query reruns.

## When to reach for this

- Wiring a React component to Convex for the first time
- Data changes on the server but the page does not update
- A list or dashboard rerenders on every unrelated write
- A "load more" list drops or duplicates rows when new data lands
- Showing who is online or typing

## How subscriptions work

`useQuery` opens a subscription over the client's websocket. The server runs the query, records its read set (every document and index range it touched), and pushes the result. When a mutation commits a write that overlaps that read set, the server reruns the query and pushes the new result. Nothing overlaps, nothing reruns. Results are cached per function and args, so two components calling `useQuery(api.tasks.list, { userId })` share one subscription. All active subscriptions update together at the same database timestamp, so the UI never shows a half applied mutation. Queries must be deterministic for this to hold, which is why `Date.now()`, `Math.random()`, and `fetch` are not allowed inside them.

## useQuery

`undefined` means loading. Pass `"skip"` instead of wrapping the hook in a condition.

```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

function TaskList({ userId }: { userId: Id<"users"> | null }) {
  const tasks = useQuery(api.tasks.list, userId ? { userId } : "skip");

  if (userId === null) return <p>Select a user</p>;
  if (tasks === undefined) return <p>Loading</p>;

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task._id}>{task.title}</li>
      ))}
    </ul>
  );
}
```

Backend queries return validated data and read through an index:

```typescript
// convex/tasks.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("tasks"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.string(),
      completed: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);
  },
});
```

## Mutations and optimistic updates

A plain `useMutation` call is enough for most UI. The subscription refreshes when the write commits, usually within a round trip. Add an optimistic update when that round trip is visible: toggles, reorders, chat sends.

```typescript
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

function useToggleTask(userId: Id<"users">) {
  return useMutation(api.tasks.toggle).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.tasks.list, { userId });
      if (current === undefined) return;
      localStore.setQuery(
        api.tasks.list,
        { userId },
        current.map((task) =>
          task._id === args.taskId
            ? { ...task, completed: !task.completed }
            : task,
        ),
      );
    },
  );
}
```

Inserting into a list works the same way. Build a temporary document with a placeholder `_id` and `_creationTime: Date.now()` (allowed here, this runs on the client), prepend it, and let the server result replace it. If the mutation throws, Convex rolls the local store back for you. Update every query the mutation affects, not just the one on screen, or the others will look stale until the server responds.

## Pagination that stays live

```typescript
// convex/messages.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const listByChannel = query({
  args: { channelId: v.id("channels"), paginationOpts: paginationOptsValidator },
  // Return shape is fixed by .paginate(): { page, isDone, continueCursor }
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

```typescript
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

function MessageList({ channelId }: { channelId: Id<"channels"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.listByChannel,
    { channelId },
    { initialNumItems: 30 },
  );

  return (
    <div>
      {results.map((m) => (
        <p key={m._id}>{m.body}</p>
      ))}
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(30)}>Load more</button>
      )}
      {status === "LoadingMore" && <p>Loading</p>}
    </div>
  );
}
```

Each loaded page is its own subscription, so inserts and deletes anywhere in the list show up without refetching. `status` is `LoadingFirstPage`, `CanLoadMore`, `LoadingMore`, or `Exhausted`. For infinite scroll, call `loadMore` from an `IntersectionObserver` on a sentinel element when `status === "CanLoadMore"`. Cursors come from `.paginate()` only. Do not build offset pagination by slicing a `.collect()` result.

## Parallel loads with useQueries

Several `useQuery` calls in one component already load in parallel and stay consistent with each other. Reach for `useQueries` when the set of queries is dynamic, such as one query per id in a list.

```typescript
import { useQueries } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

function Avatars({ userIds }: { userIds: Array<Id<"users">> }) {
  const users = useQueries(
    Object.fromEntries(
      userIds.map((userId) => [userId, { query: api.users.get, args: { userId } }]),
    ),
  );

  return (
    <div>
      {userIds.map((id) => {
        const user = users[id];
        if (user === undefined) return <span key={id}>...</span>;
        if (user instanceof Error) return <span key={id}>!</span>;
        return <img key={id} src={user.avatarUrl} alt={user.name} />;
      })}
    </div>
  );
}
```

Each value is `undefined` while loading, an `Error` on failure, or the query result.

## Avoiding churn

Churn is a query rerunning for writes the component does not care about. Fix it on the server side first.

- Narrow the read set. `withIndex` with an equality or range reads one slice. `.filter()` or a bare `.query("table")` reads the whole table, so any write to it reruns the query.
- Return only what the component renders. A query that joins five tables reruns when any of the five change.
- Never `Date.now()` in a query. Pass time as an argument and round it so the args stay stable: `useQuery(api.tasks.overdue, { now: Math.floor(Date.now() / 60000) * 60000 })` reruns once a minute, not on every render.
- Bound results with `.take(n)` or pagination. `.collect()` on a growing table is a growing read set.
- Split hot fields into their own table. A `lastSeen` timestamp on the user document reruns every query that reads users. Put it in a `presence` table with its own query.
- Debounce mutations from rapid input (typing, dragging) so the subscription is not flooded with intermediate states.

## Presence

Presence is a heartbeat mutation from each client plus a query over rows with a recent heartbeat, kept in a separate table so it does not touch anything else. Use the `@convex-dev/presence` component instead of building it. It handles heartbeats, disconnect cleanup, and a React hook.

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";

const app = defineApp();
app.use(presence);
export default app;
```

Install with `npm install @convex-dev/presence`, then follow the package README for the server wrapper and the `usePresence` hook. If you must hand roll it, keep heartbeats in their own table, dedupe on the server with an early return when the last heartbeat is recent, and read with an index on `roomId`.

## Common mistakes

| Mistake | Why it breaks | Do instead |
| --- | --- | --- |
| `if (userId) useQuery(...)` | hook order changes between renders | `useQuery(fn, userId ? args : "skip")` |
| Treating `undefined` as empty | loading state renders as "no results" | check `=== undefined` first |
| `Date.now()` inside a query | nondeterministic, breaks caching | pass `now` as an arg, rounded |
| `.filter()` on a large table | whole table in the read set | add an index, use `withIndex` |
| `.collect()` for a feed | read set grows with the table | `.take(n)` or `.paginate()` |
| Optimistic update on one query only | other views stale until the server responds | update every affected query in the callback |
| Offset pagination by slicing `.collect()` | pages drift as rows insert | `.paginate()` and `usePaginatedQuery` |
| `lastSeen` on the user document | every user query reruns on each heartbeat | separate presence table or component |

## Checklist

- [ ] Every `useQuery` handles `undefined` before reading the result
- [ ] Conditional queries use `"skip"`, not conditional hook calls
- [ ] Every backend query has `args` and `returns` validators
- [ ] Every query reads through `withIndex`, none use `.filter()` on a large table
- [ ] No `Date.now()` or `Math.random()` inside any query
- [ ] Lists that can grow use `.paginate()` and `usePaginatedQuery`
- [ ] Optimistic updates touch every query the mutation changes
- [ ] Hot fields like heartbeats live in their own table
- [ ] Rapid input mutations are debounced on the client

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/client/react
- https://docs.convex.dev/client/react/optimistic-updates
- https://docs.convex.dev/database/pagination
- https://www.convex.dev/components/presence
