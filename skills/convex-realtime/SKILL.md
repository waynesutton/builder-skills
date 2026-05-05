---
name: convex-realtime
displayName: Convex Realtime
description: Patterns for building reactive apps including subscription management, optimistic updates, cache behavior, and paginated queries with cursor-based loading
version: 1.37.0
author: Convex
tags: [convex, realtime, subscriptions, optimistic-updates, pagination]
last-updated: 2026-05-04
---

# Convex Realtime

Build reactive applications with Convex's real-time subscriptions, optimistic updates, intelligent caching, and cursor-based pagination.

## Documentation Sources

Before implementing, fetch the latest documentation - never rely on assumptions:

- Primary: https://docs.convex.dev/client/react
- Realtime: https://docs.convex.dev/realtime
- Optimistic Updates: https://docs.convex.dev/client/react/optimistic-updates
- Pagination: https://docs.convex.dev/database/pagination
- LLM context: https://docs.convex.dev/llms.txt

## Instructions

### How Convex Realtime Works

1. **Automatic Subscriptions** - useQuery creates a WebSocket-based subscription that updates automatically when data changes
2. **Smart Caching** - Query results are cached and shared across components; no bandwidth cost for cached reads
3. **Consistency** - All subscriptions receive the same database snapshot simultaneously; prevents partial updates across components
4. **Efficient Updates** - Only re-renders when relevant data changes; Convex tracks query dependencies precisely
5. **WebSocket Connection** - Client connects via WebSocket for bidirectional communication; auto-reconnects on connection loss

### Basic Subscriptions

```typescript
// React component with real-time data
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function TaskList({ userId }: { userId: Id<"users"> }) {
  // Automatically subscribes and updates in real-time
  const tasks = useQuery(api.tasks.list, { userId });

  if (tasks === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task._id}>{task.title}</li>
      ))}
    </ul>
  );
}
```

### Experimental Query Result Object

For richer error handling and status tracking, use `useQuery_experimental`:

```typescript
import { useQuery_experimental as useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function TaskList() {
  const result = useQuery({
    query: api.tasks.list,
    args: { completed: false },
  });

  if (result.status === "pending") return <div>Loading...</div>;
  if (result.status === "error")
    return <div>Error: {result.error.message}</div>;

  // status is guaranteed to be "success" here
  return result.data.map((task) => <div key={task._id}>{task.text}</div>);
}
```

This returns an object with `status: "pending" | "success" | "error"`, `data`, and `error` fields. Use `throwOnError: true` option for error boundary compatibility.

### One-off Queries

Query data in response to user actions without creating subscriptions:

```typescript
import { useConvex } from "convex/react";
import { api } from "../convex/_generated/api";

function TaskValidator() {
  const convex = useConvex();

  return (
    <button
      onClick={async () => {
        const result = await convex.query(api.tasks.validate, { taskId: "123" });
        console.log(result);
      }}
    >
      Validate Task
    </button>
  );
}
```

Use the `useConvex()` hook to access the client instance for one-off queries via `convex.query()`.

### Conditional Queries

```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function UserProfile({ userId }: { userId: Id<"users"> | null }) {
  // Skip query when userId is null
  const user = useQuery(
    api.users.get,
    userId ? { userId } : "skip"
  );

  if (userId === null) {
    return <div>Select a user</div>;
  }

  if (user === undefined) {
    return <div>Loading...</div>;
  }

  return <div>{user.name}</div>;
}
```

### Mutations with Real-time Updates

```typescript
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function TaskManager({ userId }: { userId: Id<"users"> }) {
  const tasks = useQuery(api.tasks.list, { userId });
  const createTask = useMutation(api.tasks.create);
  const toggleTask = useMutation(api.tasks.toggle);

  const handleCreate = async (title: string) => {
    // Mutation triggers automatic re-render when data changes
    await createTask({ title, userId });
  };

  const handleToggle = async (taskId: Id<"tasks">) => {
    await toggleTask({ taskId });
  };

  return (
    <div>
      <button onClick={() => handleCreate("New Task")}>Add Task</button>
      <ul>
        {tasks?.map((task) => (
          <li key={task._id} onClick={() => handleToggle(task._id)}>
            {task.completed ? "✓" : "○"} {task.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Optimistic Updates

Show changes immediately before server confirmation:

```typescript
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

function TaskItem({ task }: { task: Task }) {
  const toggleTask = useMutation(api.tasks.toggle).withOptimisticUpdate(
    (localStore, args) => {
      const { taskId } = args;
      const currentValue = localStore.getQuery(api.tasks.get, { taskId });
      
      if (currentValue !== undefined) {
        localStore.setQuery(api.tasks.get, { taskId }, {
          ...currentValue,
          completed: !currentValue.completed,
        });
      }
    }
  );

  return (
    <div onClick={() => toggleTask({ taskId: task._id })}>
      {task.completed ? "✓" : "○"} {task.title}
    </div>
  );
}
```

### Optimistic Updates for Lists

```typescript
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function useCreateTask(userId: Id<"users">) {
  return useMutation(api.tasks.create).withOptimisticUpdate(
    (localStore, args) => {
      const { title, userId } = args;
      const currentTasks = localStore.getQuery(api.tasks.list, { userId });
      
      if (currentTasks !== undefined) {
        // Add optimistic task to the list
        const optimisticTask = {
          _id: crypto.randomUUID() as Id<"tasks">,
          _creationTime: Date.now(),
          title,
          userId,
          completed: false,
        };
        
        localStore.setQuery(api.tasks.list, { userId }, [
          optimisticTask,
          ...currentTasks,
        ]);
      }
    }
  );
}
```

### Cursor-Based Pagination

```typescript
// convex/messages.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const listPaginated = query({
  args: {
    channelId: v.id("channels"),
    paginationOpts: paginationOptsValidator,
  },
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
// React component with pagination
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function MessageList({ channelId }: { channelId: Id<"channels"> }) {
  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.messages.listPaginated,
    { channelId },
    { initialNumItems: 20 }
  );

  return (
    <div>
      {results.map((message) => (
        <div key={message._id}>{message.content}</div>
      ))}
      
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(20)}>Load More</button>
      )}
      
      {status === "LoadingMore" && <div>Loading...</div>}
      
      {status === "LoadingFirstPage" && <div>Loading...</div>}
      
      {status === "Exhausted" && <div>No more messages</div>}
    </div>
  );
}
```

**Pagination status values:**
- `"LoadingFirstPage"`: Loading initial results
- `"CanLoadMore"`: More items available; call `loadMore(n)` to fetch next page
- `"LoadingMore"`: Currently loading another page
- `"Exhausted"`: All items loaded

**Important:** Page sizes can change reactively. If items are added/removed from the database, a page of 10 items may grow or shrink. This is expected behavior due to real-time reactivity.

### Infinite Scroll Pattern

```typescript
import { usePaginatedQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../convex/_generated/api";

function InfiniteMessageList({ channelId }: { channelId: Id<"channels"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.listPaginated,
    { channelId },
    { initialNumItems: 20 }
  );
  
  const observerRef = useRef<IntersectionObserver>();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && status === "CanLoadMore") {
        loadMore(20);
      }
    });

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [status, loadMore]);

  return (
    <div>
      {results.map((message) => (
        <div key={message._id}>{message.content}</div>
      ))}
      <div ref={loadMoreRef} style={{ height: 1 }} />
      {(status === "LoadingFirstPage" || status === "LoadingMore") && (
        <div>Loading...</div>
      )}
    </div>
  );
}
```

### Multiple Subscriptions

```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function Dashboard({ userId }: { userId: Id<"users"> }) {
  // Multiple subscriptions update independently but consistently
  const user = useQuery(api.users.get, { userId });
  const tasks = useQuery(api.tasks.list, { userId });
  const notifications = useQuery(api.notifications.unread, { userId });

  const isLoading = user === undefined || 
                    tasks === undefined || 
                    notifications === undefined;

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <p>You have {tasks.length} tasks</p>
      <p>{notifications.length} unread notifications</p>
    </div>
  );
}
```

**Consistency guarantee:** If a mutation affects multiple queries, all relevant subscriptions receive the same database snapshot simultaneously. Your app never renders in an inconsistent state where only one query reflects new data.

### Connection Management

ConvexReactClient maintains a WebSocket connection to your Convex deployment:

- **Automatic reconnection:** Client reconnects automatically if internet connection drops
- **Session management:** Session is re-established on reconnect with no code needed
- **No manual cleanup:** React handles subscription cleanup on unmount automatically

## Examples

### Real-time Chat Application

```typescript
// convex/messages.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .take(100);

    // Enrich with author names
    return Promise.all(
      messages.map(async (msg) => {
        const author = await ctx.db.get(msg.authorId);
        return {
          ...msg,
          authorName: author?.name ?? "Unknown",
        };
      })
    );
  },
});

export const send = mutation({
  args: {
    channelId: v.id("channels"),
    authorId: v.id("users"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      channelId: args.channelId,
      authorId: args.authorId,
      content: args.content,
    });
  },
});
```

```typescript
// ChatRoom.tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useRef, useEffect } from "react";
import { Id } from "../convex/_generated/dataModel";

interface ChatRoomProps {
  channelId: Id<"channels">;
  userId: Id<"users">;
}

function ChatRoom({ channelId, userId }: ChatRoomProps) {
  const messages = useQuery(api.messages.list, { channelId });
  const sendMessage = useMutation(api.messages.send);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    await sendMessage({
      channelId,
      authorId: userId,
      content: input.trim(),
    });
    setInput("");
  };

  return (
    <div className="chat-room">
      <div className="messages">
        {messages?.map((msg) => (
          <div key={msg._id} className="message">
            <strong>{msg.authorName}:</strong> {msg.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSend}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## Gotchas

- **Page sizes change reactively**: If you request a page of 10 items and one is removed, the page may shrink to 9. Similarly, if items are added, it may grow beyond initial size. This is expected behavior due to real-time reactivity.
- **Mutation in optimistic updates corrupts state**: Never mutate objects inside optimistic updates (e.g., `array.push(item)`). Always create new objects to avoid corrupting the client's internal state.
- **Missing optimistic ID format**: When creating optimistic IDs, use `crypto.randomUUID() as Id<"tableName">`. The client will automatically replace these with server-assigned IDs when the mutation completes.
- **useQuery_experimental behavior**: The experimental hook doesn't throw errors by default; check `result.status` before accessing data. Use `throwOnError: true` option for error boundary compatibility.

## Best Practices

- Use "skip" for conditional queries instead of wrapping hooks in conditionals
- Implement optimistic updates for better perceived performance on user actions
- Use usePaginatedQuery for large datasets with cursor-based pagination
- Handle undefined state explicitly (loading state from useQuery)
- React will automatically clean up subscriptions when components unmount; no manual cleanup needed

## Common Pitfalls

1. **Conditional hook calls** - Placing `useQuery` inside `if` statements or after early returns violates React hooks rules. Use "skip" instead.
2. **Not handling loading state** - `useQuery` returns `undefined` while loading; always check for undefined before rendering.
3. **Missing optimistic update rollback** - Optimistic updates automatically rollback on error; don't manually handle rollback.
4. **Over-fetching with pagination** - Large page sizes can cause performance issues and reactivity issues; start with 10-50 items per page.
5. **Ignoring subscription cleanup** - React automatically cleans up subscriptions on unmount; manual cleanup is unnecessary and can cause bugs.

## References

- Convex Documentation: https://docs.convex.dev/
- Realtime: https://docs.convex.dev/realtime
- React Client: https://docs.convex.dev/client/react
- Optimistic Updates: https://docs.convex.dev/client/react/optimistic-updates
- Pagination: https://docs.convex.dev/database/pagination
- LLM Context: https://docs.convex.dev/llms.txt

