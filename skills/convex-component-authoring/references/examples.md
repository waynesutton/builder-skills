# Example Components

Real-world examples of Convex components.

## Rate Limiter Component

A component that provides rate limiting functionality.

### Schema

```typescript
// rate-limiter/component/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  requests: defineTable({
    key: v.string(),
    timestamp: v.number(),
  })
  .index("by_key", ["key"])
  .index("by_key_and_time", ["key", "timestamp"]),
});
```

### Check Limit Function

```typescript
// rate-limiter/component/checkLimit.ts
import { mutation } from "./_generated/server.js";
import { v } from "convex/values";

export const checkLimit = mutation({
  args: {
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  returns: v.object({
    allowed: v.boolean(),
    remaining: v.number(),
    resetAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - args.windowMs;

    // Clean old entries
    const oldEntries = await ctx.db
      .query("requests")
      .withIndex("by_key_and_time", (q) =>
        q.eq("key", args.key).lt("timestamp", windowStart)
      )
      .collect();

    for (const entry of oldEntries) {
      await ctx.db.delete(entry._id);
    }

    // Count current window
    const currentRequests = await ctx.db
      .query("requests")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();

    const remaining = Math.max(0, args.limit - currentRequests.length);
    const allowed = remaining > 0;

    if (allowed) {
      await ctx.db.insert("requests", {
        key: args.key,
        timestamp: now,
      });
    }

    const oldestRequest = currentRequests[0];
    const resetAt = oldestRequest
      ? oldestRequest.timestamp + args.windowMs
      : now + args.windowMs;

    return { allowed, remaining: remaining - (allowed ? 1 : 0), resetAt };
  },
});
```

### Usage in Consuming App

```typescript
// Usage in consuming app
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const useRateLimitedAction = mutation({
  args: {
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(components.rateLimiter.checkLimit, args);

    if (!result.allowed) {
      return {
        success: false,
        message: `Rate limited. Try again at ${new Date(result.resetAt)}`,
      };
    }

    // Perform the rate-limited action here
    return { success: true };
  },
});
```

## More Examples

For more real-world examples, see:

- [Workpool component](https://github.com/get-convex/workpool) - Uses function handles for worker pools
- [Twilio component](https://github.com/get-convex/twilio) - Uses function handles for SMS callbacks
- [RAG component](https://www.convex.dev/components/rag) - Demonstrates pagination patterns
- [ProseMirror component](https://www.convex.dev/components/prosemirror-sync) - Exports ready-made functions
- [Better Auth Component](https://convex-better-auth.netlify.app/features/local-install) - Example of hybrid component

## Key Patterns Demonstrated

1. **Rate limiting** - Time-windowed request tracking and cleanup
2. **Function handles** - Callback patterns for external services
3. **Pagination** - Using convex-helpers for large datasets
4. **API re-mounting** - Providing ready-made functions for apps
5. **Hybrid components** - Combining local component with shared library code
