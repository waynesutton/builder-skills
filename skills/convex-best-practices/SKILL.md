---
name: convex-best-practices
description: "Production patterns for Convex apps and the rules the @convex-dev/eslint-plugin enforces: validators, indexes, idempotent mutations, avoiding OCC conflicts, thin function wrappers, error handling. Use when reviewing Convex code, asking whether a pattern is right, setting up ESLint, or fixing write conflicts and slow queries."
---

# Convex best practices

The patterns that keep a Convex app fast and correct in production. The rule that matters most: read as little as possible before you write, and read through an index.

## Rules that matter most

1. Validators on every function. `args` and `returns`, with `returns: v.null()` when nothing comes back.
2. Indexes, not filters. Every table read goes through `withIndex` against an index in `convex/schema.ts`.
3. Idempotent mutations. Return early when the document is already in the target state so retries are safe.
4. Patch without reading first. `ctx.db.patch(id, fields)` throws if the doc is missing; you rarely need the old value.
5. `Promise.all` for independent writes. Do not await them one at a time.
6. Schedule `internal.*` only. Crons and `ctx.scheduler` run without a client, so public targets skip auth.
7. Thin wrappers. Auth and business logic live in plain helpers that take `ctx`.
8. `ConvexError` for anything a client should read. Plain `Error` messages are redacted in production.

```typescript
// convex/tasks.ts
import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

const taskValidator = v.object({
  _id: v.id("tasks"),
  _creationTime: v.number(),
  userId: v.id("users"),
  title: v.string(),
  status: v.union(v.literal("open"), v.literal("done")),
});

export const listOpen = query({
  args: { userId: v.id("users") },
  returns: v.array(taskValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "open"),
      )
      .order("desc")
      .take(100);
  },
});

export const rename = mutation({
  args: { taskId: v.id("tasks"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.title.trim().length === 0) {
      throw new ConvexError("Title cannot be empty");
    }
    await ctx.db.patch(args.taskId, { title: args.title.trim() });
    return null;
  },
});
```

The schema behind that index:

```typescript
tasks: defineTable({
  userId: v.id("users"),
  title: v.string(),
  status: v.union(v.literal("open"), v.literal("done")),
})
  .index("by_user", ["userId"])
  .index("by_user_and_status", ["userId", "status"]),
```

Name indexes after their fields in order, and query fields in that same order.

## OCC and write conflicts

Convex runs mutations under optimistic concurrency control. A mutation records what it read. If another mutation commits a change to any of that data first, Convex retries it. After enough retries it fails and the client sees a write conflict error.

Conflicts come from three places:

- Two mutations writing the same document at once: counters, "last seen" fields, a shared settings doc
- A mutation that reads a wide range, such as `.collect()` on a whole table, so any change in that range conflicts with it
- A client calling the same mutation faster than it can commit: typing, dragging, polling

### Idempotent and patch first

```typescript
export const complete = mutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.status === "done") {
      return null;
    }
    await ctx.db.patch(args.taskId, { status: "done" });
    return null;
  },
});

export const reorder = mutation({
  args: { itemIds: v.array(v.id("items")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Promise.all(
      args.itemIds.map((id, index) => ctx.db.patch(id, { order: index })),
    );
    return null;
  },
});
```

The read in `complete` is fine: one document, early exit. `reorder` never reads at all.

### Event records instead of counters

A counter field on one document is the most common conflict source. Insert one row per event and count in a query.

```typescript
export const trackView = mutation({
  args: { pageId: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("pageViews", { pageId: args.pageId });
    return null;
  },
});

export const viewCount = query({
  args: { pageId: v.id("pages") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const views = await ctx.db
      .query("pageViews")
      .withIndex("by_page", (q) => q.eq("pageId", args.pageId))
      .collect();
    return views.length;
  },
});
```

Once the event table gets large, move the count to the `@convex-dev/sharded-counter` or `@convex-dev/aggregate` component instead of collecting rows.

### Dedup windows

For heartbeats and presence, skip the write when the last one was recent. Pair it with a client side debounce: 300 to 500 ms for typing, a few seconds for heartbeats.

```typescript
const DEDUP_MS = 10_000;

export const heartbeat = mutation({
  args: { sessionId: v.string(), path: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!existing) {
      await ctx.db.insert("sessions", { ...args, lastSeen: now });
      return null;
    }
    if (existing.path === args.path && now - existing.lastSeen < DEDUP_MS) {
      return null;
    }
    await ctx.db.patch(existing._id, { path: args.path, lastSeen: now });
    return null;
  },
});
```

Put hot fields such as `lastSeen` in their own table so those writes do not conflict with reads of the stable document.

## Pagination over collect

`.collect()` on an unbounded table gets slower every day and eventually hits read limits. Paginate anything a user can grow. `postValidator` below is a hoisted document validator like `taskValidator` above.

```typescript
import { paginationOptsValidator } from "convex/server";

export const feed = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(postValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null()),
    ),
  }),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

On the client, `usePaginatedQuery` from `convex/react` drives `loadMore`.

## No Date.now() in queries

Queries must be deterministic so Convex can cache them and rerun them when data changes. Pass time from the client, or store a status field that a scheduled mutation updates.

```typescript
export const dueBefore = query({
  args: { userId: v.id("users"), now: v.number() },
  returns: v.array(taskValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user_and_due", (q) =>
        q.eq("userId", args.userId).lt("dueAt", args.now),
      )
      .take(100);
  },
});
```

Mutations and actions may call `Date.now()`.

## ESLint plugin

`@convex-dev/eslint-plugin` catches the old function syntax, missing arg validators, `.filter()` in queries, and top of the hour crons at lint time. Install it in every Convex project.

```bash
npm i --save-dev @convex-dev/eslint-plugin
```

```js
// eslint.config.js
import { defineConfig } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([...convexPlugin.configs.recommended]);
```

Open [references/eslint-setup.md](references/eslint-setup.md) when you need the full rule list, the TypeScript aware config, package scripts, or a custom `convex/` directory.

## Common mistakes

| Mistake | Why it breaks | Do instead |
| --- | --- | --- |
| `.filter()` on a table query | Reads every row, then drops most | Add an index, use `withIndex` |
| `.collect()` on an unbounded table | Slower every day, hits read limits, wide OCC footprint | `.paginate()` or `.take(n)` |
| Read, compute, then patch a shared doc | Two clients read the same version and both write | Patch directly, or split into event rows |
| Counter field incremented per event | Every increment conflicts with every other | Event records or a sharded counter component |
| Mutation without an early return | Retries and double clicks apply the change twice | Check state, return `null` if already done |
| Sequential `await` on independent writes | Slow, and each read widens the conflict window | `Promise.all` |
| `Date.now()` in a query | Result changes every ms, cache and subscriptions break | Pass `now` as an arg |
| Scheduling `api.*` | Public function runs with no client auth | Schedule `internal.*` |
| Plain `Error` for user messages | Redacted to "Server Error" in production | `ConvexError` |
| Business logic inside the handler | Untestable, duplicated across functions | Plain helper that takes `ctx` |

## Checklist

- [ ] Every function has `args` and `returns`
- [ ] Every table read uses `withIndex`, never `.filter()`
- [ ] Indexes are named after their fields in order
- [ ] Mutations return early when the doc is already in the target state
- [ ] Mutations patch without a prior read unless the old value is needed
- [ ] Independent writes run under `Promise.all`
- [ ] High frequency counts use event rows or a counter component
- [ ] Unbounded lists use `.paginate()`
- [ ] No `Date.now()` inside a query
- [ ] Scheduled and cron targets are `internal.*`
- [ ] `@convex-dev/eslint-plugin` is installed and `npm run lint` passes

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/understanding/best-practices/
- https://docs.convex.dev/database/advanced/occ
- https://docs.convex.dev/database/pagination
- https://docs.convex.dev/eslint
