---
name: convex-best-practices
description: Guidelines for building production-ready Convex apps covering function organization, query patterns, validation, TypeScript usage, error handling, access control, and the Zen of Convex design philosophy
version: 1.37.0
author: Convex
tags: [convex, best-practices, typescript, development]
last-updated: 2026-05-04
---

# Convex Best Practices

Build production-ready Convex applications by following established patterns for function organization, query optimization, validation, TypeScript usage, error handling, and access control.

## Code Quality

All patterns in this skill comply with `@convex-dev/eslint-plugin`. Install it for build-time validation:

```bash
npm i @convex-dev/eslint-plugin --save-dev
```

```js
// eslint.config.js
import { defineConfig } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  ...convexPlugin.configs.recommended,
]);
```

The plugin enforces five rules:

| Rule                                | What it enforces                  |
| ----------------------------------- | --------------------------------- |
| `no-old-registered-function-syntax` | Object syntax with `handler`      |
| `require-argument-validators`       | `args: {}` on all functions       |
| `explicit-table-ids`                | Table name in db operations       |
| `import-wrong-runtime`              | No Node imports in Convex runtime |
| `no-filter-in-query`                | No `.filter()` on database queries |

Docs: https://docs.convex.dev/eslint

## Documentation Sources

Before implementing, fetch the latest documentation:

- Primary: https://docs.convex.dev/understanding/best-practices/
- Error Handling: https://docs.convex.dev/functions/error-handling
- For broader context: https://docs.convex.dev/llms.txt

## The Zen of Convex

### Performance

- **Use queries for nearly every app read** - Queries are reactive, cacheable, and consistent
- **Keep sync engine functions light** - Work with < few hundred records, finish in <100ms
- **Use actions sparingly** - Only for batch jobs or external service integration
- **Don't over-complicate client-side state** - Let Convex handle caching and consistency

### Architecture

- **Create server-side frameworks using "just code"** - Solve composition/encapsulation with plain TypeScript functions
- **Don't invoke actions directly from clients** - Trigger via mutations that write state and schedule actions
- **Think "workflow" not "background jobs"** - Pattern: action → mutation → action → mutation
- **Record progress incrementally** - Use smaller batches and mutations for progress tracking

### Development Workflow

- **Keep the dashboard by your side** - Use it for logs, testing, inspection, and configuration
- **Leverage Convex developer search** - https://search.convex.dev searches docs, Stack, and community

## Function Organization

Organize your Convex functions by domain:

```typescript
// convex/users.ts - User-related functions
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.userId);
  },
});
```

## Use Helper Functions for Shared Logic

Write most logic as plain TypeScript functions. Keep `query`, `mutation`, `action` wrappers thin:

```typescript
// convex/model/users.ts
import { QueryCtx } from '../_generated/server';

export async function getCurrentUser(ctx: QueryCtx) {
  const userIdentity = await ctx.auth.getUserIdentity();
  if (userIdentity === null) {
    throw new Error("Unauthorized");
  }
  const user = await ctx.db.query("users")
    .withIndex("by_tokenIdentifier", (q) => 
      q.eq("tokenIdentifier", userIdentity.tokenIdentifier)
    )
    .unique();
  return user;
}

// convex/users.ts - thin wrapper
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});
```

Benefits:
- Easier refactoring
- Reusable logic between public/internal functions
- Simpler to test

## Argument and Return Validation

Always define validators for arguments AND return types:

```typescript
export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      priority: args.priority,
      completed: false,
      createdAt: Date.now(),
    });
  },
});
```

## Query Patterns

Use indexes instead of filters for efficient queries:

```typescript
// Schema with index
export default defineSchema({
  tasks: defineTable({
    userId: v.id("users"),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"]),
});

// Query using index
export const getTasksByUser = query({
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

**Avoid `.filter()` on queries** - Use `.withIndex()` or filter in code instead. Filtering in code is often clearer and has the same performance.

## Access Control

All public functions must have access control:

```typescript
// ❌ Missing access control
export const updateTeam = mutation({
  args: { id: v.id("teams"), name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("teams", args.id, { name: args.name });
  },
});

// ✅ Check ctx.auth (cannot be spoofed)
export const updateTeam = mutation({
  args: { id: v.id("teams"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) {
      throw new Error("Unauthorized");
    }
    
    const team = await ctx.db.get("teams", args.id);
    if (!team || team.owner !== user.tokenIdentifier) {
      throw new Error("Unauthorized");
    }
    
    await ctx.db.patch("teams", args.id, { name: args.name });
  },
});

// ✅ Separate functions for different permissions
export const setTeamOwner = mutation({
  args: { id: v.id("teams"), owner: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) {
      throw new Error("Unauthorized");
    }
    const team = await ctx.db.get("teams", args.id);
    if (!team || team.owner !== user.tokenIdentifier) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch("teams", args.id, { owner: args.owner });
  },
});
```

**Never use user-provided email/username for access control** - These can be spoofed. Use `ctx.auth.getUserIdentity()` or unguessable IDs like Convex IDs or UUIDs.

## Error Handling

Use ConvexError for user-facing errors:

```typescript
import { ConvexError } from "convex/values";

export const updateTask = mutation({
  args: { taskId: v.id("tasks"), title: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);

    if (!task) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Task not found",
      });
    }

    await ctx.db.patch("tasks", args.taskId, { title: args.title });
  },
});
```

## Internal vs Public Functions

Only schedule and call internal functions from other Convex functions:

```typescript
// Public function - exposed to clients
export const sendMessage = mutation({
  args: { body: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) {
      throw new Error("Unauthorized");
    }
    await ctx.db.insert("messages", { body: args.body, author: user.tokenIdentifier });
  },
});

// Internal function - only callable within Convex
export const sendSystemMessage = internalMutation({
  args: { body: v.string() },
  handler: async (ctx, args) => {
    // No auth check needed - can only be called from Convex
    await ctx.db.insert("messages", { body: args.body, author: "system" });
  },
});
```

**Never use `api` from `_generated/api.ts` in Convex functions** - Only use `internal`.

## Use runAction Sparingly

Only use `ctx.runAction` when calling code that requires a different runtime (Node.js from Convex runtime):

```typescript
// ❌ Calling action that uses same runtime
export const processData = action({
  args: { data: v.string() },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.process.step1, { data: args.data });
    await ctx.runAction(internal.process.step2, { data: args.data });
  },
});

// ✅ Use plain TypeScript function instead
import { ActionCtx } from './_generated/server';

async function step1(ctx: ActionCtx, args: { data: string }) {
  // Node.js code
  const result = await externalAPI.process(args.data);
  await ctx.runMutation(internal.process.saveResult, { result });
}

async function step2(ctx: ActionCtx, args: { data: string }) {
  // More Node.js code
}

export const processData = action({
  args: { data: v.string() },
  handler: async (ctx, args) => {
    await step1(ctx, args);
    await step2(ctx, args);
  },
});
```

## Avoid Sequential ctx.runMutation / ctx.runQuery Calls

Each call runs in its own transaction - combine related work:

```typescript
// ❌ Separate queries - could be inconsistent
const team = await ctx.runQuery(internal.teams.getTeam, { teamId });
const owner = await ctx.runQuery(internal.teams.getTeamOwner, { teamId });
if (team.owner !== owner._id) { /* this assertion could fail */ }

// ✅ Single query - guaranteed consistent
const { team, owner } = await ctx.runQuery(internal.teams.getTeamAndOwner, { teamId });
if (team.owner !== owner._id) { /* always passes */ }
```

## Table Name Required

Always include the table name in db operations:

```typescript
// ❌ Missing table name
await ctx.db.get(movieId);
await ctx.db.patch(movieId, { title: "Whiplash" });

// ✅ Include table name
await ctx.db.get("movies", movieId);
await ctx.db.patch("movies", movieId, { title: "Whiplash" });
```

## Don't Use Date.now() in Queries

Queries don't re-run when time changes, and this invalidates cache unnecessarily:

```typescript
// ❌ Stale results, cache churn
const releasedPosts = await ctx.db
  .query("posts")
  .withIndex("by_releasedAt", (q) => q.lte("releasedAt", Date.now()))
  .take(100);

// ✅ Update from scheduled function, query boolean flag
const releasedPosts = await ctx.db
  .query("posts")
  .withIndex("by_isReleased", (q) => q.eq("isReleased", true))
  .take(100);
```

Or pass time as argument from client (avoid changing frequently).

## Avoiding Write Conflicts (Optimistic Concurrency Control)

```typescript
// GOOD: Make mutations idempotent
export const completeTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.status === "completed") {
      return null;
    }
    await ctx.db.patch("tasks", args.taskId, {
      status: "completed",
      completedAt: Date.now(),
    });
    return null;
  },
});

// GOOD: Patch directly without reading first when possible
export const updateNote = mutation({
  args: { id: v.id("notes"), content: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("notes", args.id, { content: args.content });
    return null;
  },
});

// GOOD: Use Promise.all for parallel independent updates
export const reorderItems = mutation({
  args: { itemIds: v.array(v.id("items")) },
  handler: async (ctx, args) => {
    const updates = args.itemIds.map((id, index) =>
      ctx.db.patch("items", id, { order: index }),
    );
    await Promise.all(updates);
    return null;
  },
});
```

## TypeScript Best Practices

```typescript
import { Id, Doc } from "./_generated/dataModel";

// Use Id type for document references
type UserId = Id<"users">;

// Use Doc type for full documents
type User = Doc<"users">;

// Define Record types properly
const userScores: Record<Id<"users">, number> = {};
```

## Common Pitfalls

1. **Missing access control** - All public functions must check `ctx.auth.getUserIdentity()`
2. **Using filter instead of withIndex** - Always define indexes and use withIndex, or filter in code
3. **Missing return validators** - Always specify the returns field
4. **Non-idempotent mutations** - Check current state before updating to handle retries
5. **Reading before patching unnecessarily** - Patch directly when possible
6. **Using Date.now() in queries** - Causes stale results and cache invalidation
7. **Calling actions from clients** - Use mutations to write state and schedule actions
8. **Sequential ctx.run* calls from actions** - Combine into single transaction for consistency
9. **Using runAction unnecessarily** - Only for cross-runtime calls (Convex ↔ Node.js)
10. **Not using helper functions** - Most logic should be plain TypeScript, not wrapped functions
11. **Using api instead of internal** - Internal functions can only be called from Convex
12. **Spoofable access control** - Never use email/username from args for auth checks
13. **Redundant indexes** - Index like `by_foo` is redundant if you have `by_foo_and_bar`
14. **Using .collect() on large result sets** - Use pagination, limits, or denormalization for 1000+ docs
15. **Using runQuery/runMutation when helper function works** - Use plain TypeScript functions instead

## Examples

### Complete CRUD Pattern

```typescript
// convex/tasks.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      title: args.title,
      completed: false,
      userId: args.userId,
    });
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { taskId, ...updates } = args;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );
    if (Object.keys(cleanUpdates).length > 0) {
      await ctx.db.patch("tasks", taskId, cleanUpdates);
    }
    return null;
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete("tasks", args.taskId);
    return null;
  },
});
```

## Best Practices Summary

- Never run `npx convex deploy` unless explicitly instructed
- Never run any git commands unless explicitly instructed
- Always define argument and return validators for functions
- Use indexes for all queries that filter data
- Make mutations idempotent to handle retries gracefully
- Use ConvexError for user-facing error messages
- Organize functions by domain (users.ts, tasks.ts, etc.)
- Use internal functions for sensitive operations
- Use helper functions for shared logic
- Check access control on all public functions
- Use `ctx.auth.getUserIdentity()` for auth, never user-provided emails
- Leverage TypeScript's Id and Doc types
- Avoid Date.now() in queries
- Use runAction only for cross-runtime calls
- Combine sequential ctx.run* calls into single operations

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Best Practices: https://docs.convex.dev/understanding/best-practices/
- Zen of Convex: https://docs.convex.dev/understanding/zen.md
- Error Handling: https://docs.convex.dev/functions/error-handling
- Write Conflicts: https://docs.convex.dev/error#1
- Convex Developer Search: https://search.convex.dev
