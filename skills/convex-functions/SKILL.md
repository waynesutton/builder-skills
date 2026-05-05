---
name: convex-functions
displayName: Convex Functions
description: Writing queries, mutations, actions, and HTTP actions with proper argument validation, error handling, internal functions, and runtime considerations
version: 1.37.0
author: Convex
tags: [convex, functions, queries, mutations, actions, http]
last-updated: 2026-05-04
---

# Convex Functions

Master Convex functions including queries, mutations, actions, and HTTP endpoints with proper validation, error handling, and runtime considerations.

## Code Quality

All examples in this skill comply with @convex-dev/eslint-plugin rules:

- Object syntax with `handler` property
- Argument validators on all public functions
- Explicit table names in database operations

See the Code Quality section in [convex-best-practices](../convex-best-practices/SKILL.md) for linting setup.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/functions
- Query Functions: https://docs.convex.dev/functions/query-functions
- Mutation Functions: https://docs.convex.dev/functions/mutation-functions
- Actions: https://docs.convex.dev/functions/actions
- HTTP Actions: https://docs.convex.dev/functions/http-actions
- Internal Functions: https://docs.convex.dev/functions/internal-functions
- Validation: https://docs.convex.dev/functions/validation
- Error Handling: https://docs.convex.dev/functions/error-handling
- Bundling: https://docs.convex.dev/functions/bundling
- Runtimes: https://docs.convex.dev/functions/runtimes
- For broader context: https://docs.convex.dev/llms.txt

## Instructions

### Function Types Overview

| Type        | Database Access          | External APIs | Caching       | Use Case              |
| ----------- | ------------------------ | ------------- | ------------- | --------------------- |
| Query       | Read-only                | No            | Yes, reactive | Fetching data         |
| Mutation    | Read/Write               | No            | No            | Modifying data        |
| Action      | Via runQuery/runMutation | Yes           | No            | External integrations |
| HTTP Action | Via runQuery/runMutation | Yes           | No            | Webhooks, APIs        |

### Queries

Queries are reactive, cached, and read-only. They must be deterministic.

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.userId);
  },
});

// Query with index
export const listUserTasks = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});
```

### Mutations

Mutations modify the database and are transactional. They must be deterministic.

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const createTask = mutation({
  args: {
    title: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) {
      throw new ConvexError("User not found");
    }

    return await ctx.db.insert("tasks", {
      title: args.title,
      userId: args.userId,
      completed: false,
      createdAt: Date.now(),
    });
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete("tasks", args.taskId);
  },
});
```

### Actions

Actions can call external APIs but have no direct database access. They can run in the default Convex runtime or Node.js.

**Default runtime (no "use node")**: Supports `fetch`, no cold starts, 64MB memory limit
**Node.js runtime (with "use node")**: Full Node.js API, cold starts, 512MB memory limit

```typescript
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// Default runtime - uses fetch directly
export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const response = await fetch("https://api.email.com/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    return { success: response.ok };
  },
});

// Node.js runtime - for Node.js-specific libraries
"use node";

import { action } from "./_generated/server";
import sharp from "sharp";

export const resizeImage = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const resized = await sharp(buffer).resize(300, 300).toBuffer();
    return await ctx.storage.store(new Uint8Array(resized));
  },
});

// Best practice: batch database access into single calls
export const processOrder = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(api.orders.get, { orderId: args.orderId });
    if (!order) {
      throw new Error("Order not found");
    }

    const paymentResult = await processPayment(order);
    await ctx.runMutation(internal.orders.updateStatus, {
      orderId: args.orderId,
      status: paymentResult.success ? "paid" : "failed",
    });
  },
});
```

### HTTP Actions

HTTP actions handle webhooks and external requests:

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

// Webhook endpoint
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const body = await request.text();

    if (!verifyStripeSignature(body, signature)) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(body);
    await ctx.runMutation(internal.payments.handleWebhook, {
      eventType: event.type,
      data: event.data,
    });

    return new Response("OK", { status: 200 });
  }),
});

// API endpoint
http.route({
  path: "/api/users/:userId",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const userId = url.pathname.split("/").pop();

    const user = await ctx.runQuery(api.users.get, {
      userId: userId as Id<"users">,
    });

    if (!user) {
      return new Response("Not found", { status: 404 });
    }

    return Response.json(user);
  }),
});

export default http;
```

### Internal Functions

Internal functions can only be called from other Convex functions, not from clients. Use them for:

- Sensitive operations that shouldn't be callable directly
- Helper functions called by actions via `runQuery`/`runMutation`
- Scheduled functions
- Functions run from dashboard or CLI

```typescript
import {
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { v } from "convex/values";

export const _updateUserCredits = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return;

    await ctx.db.patch("users", args.userId, {
      credits: (user.credits || 0) + args.amount,
    });
  },
});

// Call internal function from action
export const purchaseCredits = action({
  args: { userId: v.id("users"), amount: v.number() },
  handler: async (ctx, args) => {
    await processPayment(args.amount);
    await ctx.runMutation(internal.users._updateUserCredits, {
      userId: args.userId,
      amount: args.amount,
    });
  },
});
```

### Scheduling Functions

Schedule functions to run later using `ctx.scheduler`:

```typescript
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const scheduleReminder = mutation({
  args: {
    userId: v.id("users"),
    message: v.string(),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.scheduler.runAfter(
      args.delayMs,
      internal.notifications.sendReminder,
      { userId: args.userId, message: args.message },
    );
  },
});

export const sendReminder = internalMutation({
  args: {
    userId: v.id("users"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      userId: args.userId,
      message: args.message,
      sentAt: Date.now(),
    });
  },
});
```

## Examples

### Complete Function File

```typescript
// convex/messages.ts
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";

export const list = query({
  args: {
    channelId: v.id("channels"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .take(limit);
  },
});

export const send = mutation({
  args: {
    channelId: v.id("channels"),
    authorId: v.id("users"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.content.trim().length === 0) {
      throw new ConvexError("Message cannot be empty");
    }

    const messageId = await ctx.db.insert("messages", {
      channelId: args.channelId,
      authorId: args.authorId,
      content: args.content.trim(),
    });

    await ctx.scheduler.runAfter(0, internal.messages.notifySubscribers, {
      channelId: args.channelId,
      messageId,
    });

    return messageId;
  },
});

export const notifySubscribers = internalMutation({
  args: {
    channelId: v.id("channels"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const subscribers = await ctx.db
      .query("subscriptions")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    for (const sub of subscribers) {
      await ctx.db.insert("notifications", {
        userId: sub.userId,
        messageId: args.messageId,
        read: false,
      });
    }
  },
});
```

## Validation

Always validate arguments on public functions for security. TypeScript types don't protect at runtime.

```typescript
import { v } from "convex/values";

export const createUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    age: v.optional(v.number()),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    // args are validated automatically
  },
});
```

**Supported types**: `v.string()`, `v.number()`, `v.boolean()`, `v.null()`, `v.id()`, `v.int64()`, `v.bytes()`, `v.array()`, `v.object()`, `v.record()`, `v.union()`, `v.literal()`, `v.optional()`, `v.any()`, `v.email()`, `v.url()`

## Error Handling

Use `ConvexError` for expected failures (validation errors, user-facing messages):

```typescript
import { ConvexError } from "convex/values";

export const transferFunds = mutation({
  args: { from: v.id("users"), to: v.id("users"), amount: v.number() },
  handler: async (ctx, args) => {
    const sender = await ctx.db.get("users", args.from);
    if (!sender || sender.balance < args.amount) {
      throw new ConvexError("Insufficient funds");
    }
  },
});
```

**Query errors**: Use React error boundaries to catch
**Mutation errors**: Caught by promises, optimistic updates roll back
**Action errors**: Not retried automatically (side effects), caller must handle

## Bundling

Convex bundles your code with esbuild automatically:

- Default runtime: Most browser-compatible packages work
- Node.js runtime: Can mark packages as external in `convex.json`:
```json
{
  "node": {
    "externalPackages": ["sharp", "aws-sdk"]
  }
}
```

**Bundle size limit**: 32MiB total. External packages add: 45MiB zipped, 240MiB unzipped limit.

**Troubleshooting large bundles**:
```bash
npx convex dev --once --debug-bundle-path /tmp/myBundle
npx source-map-explorer /tmp/myBundle/**/*.js
```

## Runtimes

**Default Convex Runtime** (recommended for most cases):
- No cold starts
- Browser-like APIs (`fetch`, `crypto`, streams)
- 64MB memory limit
- Deterministic (Math.random, Date.now seeded)

**Node.js Runtime** (use `"use node"`):
- Full Node.js API (fs, child_process, etc.)
- Cold starts on first execution
- 512MB memory limit
- Use for libraries like sharp, pdf-parse, or Node.js-specific APIs
- Configure Node.js version in `convex.json`: supports Node 20 and 22

## Best Practices

- **Queries**: Use for reads (cached, reactive)
- **Mutations**: Use for writes (transactional, deterministic)
- **Actions**: Only for external APIs (can have side effects)
- **Internal functions**: For sensitive operations or helpers
- **Validation**: Always validate args on public functions
- **Error handling**: Use ConvexError for expected failures
- **Avoid**: Multiple `runQuery`/`runMutation` in actions (batch into single call)
- **Avoid**: `await ctx.runAction` (use helper functions instead)
- **Anti-pattern**: Calling actions directly from client (use mutation → schedule action)
- **Performance**: Use indexes to avoid full table scans

## Gotchas

1. **"use node" files** cannot contain queries/mutations (only actions)
2. **"use node" files** cannot be imported by non-"use node" files
3. **Actions from single client** run in parallel (not queued like mutations)
4. **Read/write limits**: Functions have limits on data accessed per execution
5. **Undefined returns**: Convex converts `undefined` to `null` on client
6. **Extra properties**: Validators throw on undeclared properties (unlike TypeScript)
7. **External packages**: Version installed in local node_modules determines server version
8. **Date.now()**: Frozen during function execution (same value throughout)
9. **Math.random()**: Seeded for determinism in queries/mutations

## Common Pitfalls

1. **Using actions for database operations** - Use queries/mutations instead
2. **Calling external APIs from queries/mutations** - Use actions
3. **Forgetting "use node"** - Required for Node.js APIs in actions
4. **Not using internal functions** - Expose sensitive operations directly
5. **Multiple runQuery/runMutation in actions** - Batch into single internal function
6. **Calling actions from client** - Use mutation + scheduler pattern instead
7. **Assuming setTimeout/ setInterval work** - Use scheduler instead
8. **Not handling action errors** - Actions not retried automatically

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Functions Overview: https://docs.convex.dev/functions
- Query Functions: https://docs.convex.dev/functions/query-functions
- Mutation Functions: https://docs.convex.dev/functions/mutation-functions
- Actions: https://docs.convex.dev/functions/actions
- Internal Functions: https://docs.convex.dev/functions/internal-functions
- Validation: https://docs.convex.dev/functions/validation
- Error Handling: https://docs.convex.dev/functions/error-handling
- Bundling: https://docs.convex.dev/functions/bundling
- Runtimes: https://docs.convex.dev/functions/runtimes
