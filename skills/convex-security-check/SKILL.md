---
name: convex-security-check
displayName: Convex Security Check
description: Quick security audit checklist covering authentication, function exposure, argument validation, row-level access control, and environment variable handling
version: 1.37.0
author: Convex
tags: [convex, security, authentication, authorization, checklist]
last-updated: 2026-05-04
---

# Convex Security Check

A quick security audit checklist for Convex applications covering authentication, function exposure, argument validation, row-level access control, and environment variable handling.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/auth
- Production Security: https://docs.convex.dev/production
- Functions Auth: https://docs.convex.dev/auth/functions-auth
- For broader context: https://docs.convex.dev/llms.txt

## Gotchas

Critical security issues that don't follow obvious patterns:

- **Environment variables are `string | undefined`** - Always check for undefined before use. Missing variables return `undefined`, not an error.
- **Never condition function exports on environment variables** - This throws runtime errors. Use the same function type regardless of environment.
- **Service authentication requires shared secrets** - External services without OpenID JWTs need a public function that validates a shared secret from an environment variable.
- **Pass IDs, not documents, to internal functions** - Internal functions should receive document IDs to ensure they work with up-to-date database state.
- **Custom JWT auth uses dot notation** - Access nested fields like `identity["properties.email"]` instead of `identity.email`.
- **System variables are always available** - `CONVEX_CLOUD_URL` and `CONVEX_SITE_URL` are pre-set for deployment URLs.
- **HTTP Actions use Authorization header** - Call HTTP endpoints with `Authorization: Bearer ${jwtToken}` header.
- **Convex Auth library is in beta** - If using the built-in Convex Auth library, note it's beta and may change. See https://docs.convex.dev/auth/convex-auth.md.

## Security Checklist

Use this checklist to quickly audit your Convex application's security:

### 1. Authentication

- [ ] Authentication provider configured (Clerk, Auth0, Convex Auth, or custom)
- [ ] All sensitive queries check `ctx.auth.getUserIdentity()`
- [ ] Unauthenticated access explicitly allowed where intended
- [ ] Service-to-service calls use shared secret validation

### 2. Function Exposure

- [ ] Public functions (`query`, `mutation`, `action`) reviewed
- [ ] Internal functions use `internalQuery`, `internalMutation`, `internalAction`
- [ ] No sensitive operations exposed as public functions
- [ ] HTTP actions validate origin/authentication

### 3. Argument Validation

- [ ] All functions have explicit `args` validators
- [ ] All functions have explicit `returns` validators
- [ ] No `v.any()` used for sensitive data
- [ ] ID validators use correct table names

### 4. Row-Level Access Control

- [ ] Users can only access their own data
- [ ] Admin functions check user roles
- [ ] Shared resources have proper access checks
- [ ] Deletion functions verify ownership

### 5. Environment Variables

- [ ] API keys stored in environment variables
- [ ] No secrets in code or schema
- [ ] Different keys for dev/prod environments
- [ ] Environment variables validated for undefined before use

## Authentication Patterns

### Standard Authentication

Use Clerk, Auth0, or Convex Auth as your default authentication provider. Access identity via `ctx.auth.getUserIdentity()`:

```typescript
// convex/auth.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication required");
  }
  return identity;
}

// Guaranteed fields: tokenIdentifier, subject, issuer
// Additional fields depend on provider: email, emailVerified, name, pictureUrl, etc.
```

### Service Authentication

For external services without OpenID JWTs, use a shared secret pattern:

```typescript
// convex/service.ts
import { action } from "./_generated/server";
import { v } from "convex/values";

export const externalServiceWebhook = action({
  args: { secret: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    // Validate shared secret from environment variable
    if (args.secret !== process.env.SERVICE_SHARED_SECRET) {
      throw new Error("Unauthorized");
    }
    // Process webhook data...
  },
});
```

### HTTP Action Authentication

HTTP actions accept JWT tokens via Authorization header:

```typescript
// Client-side
const jwtToken = "...";
fetch("https://<deployment>.convex.site/myAction", {
  headers: { Authorization: `Bearer ${jwtToken}` },
});
```

## Function Exposure

### Public Functions

Exposed to clients - review carefully:

```typescript
export const listPublicPosts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect();
  },
});
```

### Internal Functions

Only callable from other Convex functions - use for sensitive operations:

```typescript
export const _updateUserCredits = internalMutation({
  args: { userId: v.id("users"), amount: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { credits: args.amount });
  },
});
```

Call internal functions from actions:

```typescript
export const upgrade = action({
  args: { planId: v.id("plans") },
  handler: async (ctx, args) => {
    const response = await fetch("https://...");
    if (response.ok) {
      await ctx.runMutation(internal.plans.markPlanAsProfessional, {
        planId: args.planId,
      });
    }
  },
});
```

## Argument Validation

### Strict Validation

Always use explicit validators for arguments and returns:

```typescript
export const createPost = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    category: v.union(
      v.literal("tech"),
      v.literal("news"),
      v.literal("other")
    ),
  },
  returns: v.id("posts"),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    return await ctx.db.insert("posts", {
      ...args,
      authorId: identity.tokenIdentifier,
    });
  },
});
```

### Avoid Weak Validation

Never use `v.any()` for sensitive operations:

```typescript
// BAD: Allows any data
export const createPostUnsafe = mutation({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("posts", args.data);
  },
});
```

## Row-Level Access Control

### Ownership Verification

Always verify ownership before update/delete operations:

```typescript
export const updateTask = mutation({
  args: { taskId: v.id("tasks"), title: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const task = await ctx.db.get(args.taskId);

    if (!task || task.userId !== identity.tokenIdentifier) {
      throw new ConvexError("Not authorized to update this task");
    }

    await ctx.db.patch(args.taskId, { title: args.title });
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const task = await ctx.db.get(args.taskId);

    if (!task || task.userId !== identity.tokenIdentifier) {
      throw new ConvexError("Not authorized to delete this task");
    }

    await ctx.db.delete(args.taskId);
  },
});
```

### Role-Based Access

Check user roles for admin functions:

```typescript
async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthenticatedUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return user;
}

export const listAllUsers = query({
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("users").collect();
  },
});
```

## Environment Variables

### Access and Validate

Environment variables return `string | undefined` - always validate:

```typescript
export const sendEmail = action({
  args: { to: v.string(), subject: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@example.com",
        to: args.to,
        subject: args.subject,
        html: args.body,
      }),
    });

    return { success: response.ok };
  },
});
```

### System Environment Variables

These are always available:

```typescript
// CONVEX_CLOUD_URL - Your deployment URL for Convex clients
const cloudUrl = process.env.CONVEX_CLOUD_URL; // "https://dusty-nightingale-847.convex.cloud"

// CONVEX_SITE_URL - Your deployment site URL for HTTP Actions
const siteUrl = process.env.CONVEX_SITE_URL; // "https://dusty-nightingale-847.convex.site"
```

### Common Mistake: Conditioning Exports

Never condition function exports on environment variables:

```typescript
// THIS WILL FAIL AT RUNTIME!
export const myFunc = process.env.DEBUG ? mutation(...) : internalMutation(...);

// INSTEAD: Use the same function type and handle logic inside
export const myFunc = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEBUG === "true") {
      // Debug logic here
    }
  },
});
```

## Complete Security Pattern

Combining all security patterns:

```typescript
// convex/secure.ts
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be logged in",
    });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (!user) {
    throw new ConvexError({
      code: "USER_NOT_FOUND",
      message: "User profile not found",
    });
  }

  return user;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthenticatedUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return user;
}

export const listMyTasks = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("tasks"),
    title: v.string(),
    completed: v.boolean(),
  })),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const listAllUsers = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("users"),
    name: v.string(),
    role: v.string(),
  })),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("users").collect();
  },
});

export const _setUserRole = internalMutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { role: args.role });
  },
});
```

## Best Practices

- Always verify user identity before returning sensitive data
- Use internal functions for sensitive operations that shouldn't be client-accessible
- Validate all arguments with strict validators, never use `v.any()` for sensitive data
- Check ownership before update/delete operations
- Store API keys in environment variables, not in code or database
- Review all public functions for security implications
- Use shared secret pattern for service-to-service authentication
- Validate environment variables are defined before use (they return `undefined` if not set)
- Never condition function exports on environment variables
- Pass document IDs to internal functions, not documents themselves

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Authentication: https://docs.convex.dev/auth
- Production Security: https://docs.convex.dev/production
- Functions Auth: https://docs.convex.dev/auth/functions-auth
- Environment Variables: https://docs.convex.dev/production/environment-variables
- Internal Functions: https://docs.convex.dev/functions/internal-functions
- Skill Best Practices: https://agentskills.io/skill-creation/best-practices
