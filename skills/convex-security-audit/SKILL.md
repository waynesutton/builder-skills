---
name: convex-security-audit
displayName: Convex Security Audit
description: Deep security review patterns for authorization logic, data access boundaries, action isolation, rate limiting, and protecting sensitive operations
version: 1.37.0
author: Convex
tags: [convex, security, audit, authorization, rate-limiting, protection]
last-updated: 2026-05-04
---

# Convex Security Audit

Comprehensive security review patterns for Convex applications including authorization logic, data access boundaries, action isolation, rate limiting, and protecting sensitive operations.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/auth/functions-auth
- Production Security: https://docs.convex.dev/production
- Authentication: https://docs.convex.dev/auth
- For broader context: https://docs.convex.dev/llms.txt

## Instructions

### Security Audit Areas

1. **Authorization Logic** - Who can do what
2. **Data Access Boundaries** - What data users can see
3. **Action Isolation** - Protecting external API calls
4. **Rate Limiting** - Preventing abuse
5. **Sensitive Operations** - Protecting critical functions
6. **Service Authentication** - External service access

### Authorization Logic Audit

#### Role-Based Access Control (RBAC)

```typescript
// convex/lib/auth.ts
import { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import { Doc } from "./_generated/dataModel";

type UserRole = "user" | "moderator" | "admin" | "superadmin";

const roleHierarchy: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  superadmin: 3,
};

export async function getUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // Note: tokenIdentifier is guaranteed to exist, other fields depend on provider
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  minRole: UserRole
): Promise<Doc<"users">> {
  const user = await getUser(ctx);

  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
  }

  const userRoleLevel = roleHierarchy[user.role as UserRole] ?? 0;
  const requiredLevel = roleHierarchy[minRole];

  if (userRoleLevel < requiredLevel) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Role '${minRole}' or higher required`,
    });
  }

  return user;
}

// Permission-based check
type Permission = "read:users" | "write:users" | "delete:users" | "admin:system";

const rolePermissions: Record<UserRole, Permission[]> = {
  user: ["read:users"],
  moderator: ["read:users", "write:users"],
  admin: ["read:users", "write:users", "delete:users"],
  superadmin: ["read:users", "write:users", "delete:users", "admin:system"],
};

export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission
): Promise<Doc<"users">> {
  const user = await getUser(ctx);

  if (!user) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });
  }

  const userRole = user.role as UserRole;
  const permissions = rolePermissions[userRole] ?? [];

  if (!permissions.includes(permission)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Permission '${permission}' required`,
    });
  }

  return user;
}
```

#### Authentication Provider Considerations

When using third-party auth providers, the fields available in `getUserIdentity()` depend on the provider configuration:

- **Clerk**: At minimum includes `tokenIdentifier`, `subject`, `issuer`. Additional fields depend on claims configured (commonly `familyName`, `givenName`, `nickname`, `pictureUrl`, `updatedAt`, `email`, `emailVerified`)
- **Auth0**: Similar standard OpenID fields, configurable through Auth0 dashboard
- **WorkOS AuthKit**: Built for B2B apps, includes organization-specific claims
- **Custom JWT**: Fields accessed via dot notation like `identity["properties.email"]`
- **Convex Auth**: Beta feature with built-in auth, includes standard OpenID fields

```typescript
// Example: Safe field access with provider variations
export async function getUserWithEmail(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // tokenIdentifier is always available (combination of subject + issuer)
  const { tokenIdentifier } = identity;

  // Other fields may not be present depending on provider
  const email = identity.email ?? null;
  const name = identity.name ?? null;

  return { tokenIdentifier, email, name };
}
```

### Data Access Boundaries Audit

```typescript
// convex/data.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUser, requireRole } from "./lib/auth";
import { ConvexError } from "convex/values";

// Audit: Users can only see their own data
export const getMyData = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("userData"),
    content: v.string(),
  })),
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];

    // SECURITY: Filter by userId
    return await ctx.db
      .query("userData")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

// Audit: Verify ownership before returning sensitive data
export const getSensitiveItem = query({
  args: { itemId: v.id("sensitiveItems") },
  returns: v.union(v.object({
    _id: v.id("sensitiveItems"),
    secret: v.string(),
  }), v.null()),
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) return null;

    const item = await ctx.db.get(args.itemId);

    // SECURITY: Verify ownership
    if (!item || item.ownerId !== user._id) {
      return null; // Don't reveal if item exists
    }

    return item;
  },
});

// Audit: Shared resources with access list
export const getSharedDocument = query({
  args: { docId: v.id("documents") },
  returns: v.union(v.object({
    _id: v.id("documents"),
    content: v.string(),
    accessLevel: v.string(),
  }), v.null()),
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const doc = await ctx.db.get(args.docId);

    if (!doc) return null;

    // Public documents
    if (doc.visibility === "public") {
      return { ...doc, accessLevel: "public" };
    }

    // Must be authenticated for non-public
    if (!user) return null;

    // Owner has full access
    if (doc.ownerId === user._id) {
      return { ...doc, accessLevel: "owner" };
    }

    // Check shared access
    const access = await ctx.db
      .query("documentAccess")
      .withIndex("by_doc_and_user", (q) =>
        q.eq("documentId", args.docId).eq("userId", user._id)
      )
      .unique();

    if (!access) return null;

    return { ...doc, accessLevel: access.level };
  },
});
```

### Action Isolation Audit

```typescript
// convex/actions.ts
"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { ConvexError } from "convex/values";

// SECURITY: Never expose API keys in responses
export const callExternalAPI = action({
  args: { query: v.string() },
  returns: v.object({ result: v.string() }),
  handler: async (ctx, args) => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    // Get API key from environment (not hardcoded)
    const apiKey = process.env.EXTERNAL_API_KEY;
    if (!apiKey) {
      throw new Error("API key not configured");
    }

    // Log usage for audit trail
    await ctx.runMutation(internal.audit.logAPICall, {
      userId: identity.tokenIdentifier,
      endpoint: "external-api",
      timestamp: Date.now(),
    });

    const response = await fetch("https://api.example.com/query", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: args.query }),
    });

    if (!response.ok) {
      // Don't expose external API error details
      throw new ConvexError("External service unavailable");
    }

    const data = await response.json();

    // Sanitize response before returning
    return { result: sanitizeResponse(data) };
  },
});

// Internal action - not exposed to clients
export const _processPayment = internalAction({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    paymentMethodId: v.string(),
  },
  returns: v.object({ success: v.boolean(), transactionId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    // Process payment with Stripe
    // This should NEVER be exposed as a public action

    return { success: true, transactionId: "txn_xxx" };
  },
});
```

### Rate Limiting Audit

```typescript
// convex/rateLimit.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

const RATE_LIMITS = {
  message: { requests: 10, windowMs: 60000 }, // 10 per minute
  upload: { requests: 5, windowMs: 300000 },  // 5 per 5 minutes
  api: { requests: 100, windowMs: 3600000 },  // 100 per hour
};

export const checkRateLimit = mutation({
  args: {
    userId: v.string(),
    action: v.union(v.literal("message"), v.literal("upload"), v.literal("api")),
  },
  returns: v.object({ allowed: v.boolean(), retryAfter: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const limit = RATE_LIMITS[args.action];
    const now = Date.now();
    const windowStart = now - limit.windowMs;

    // Count requests in window
    const requests = await ctx.db
      .query("rateLimits")
      .withIndex("by_user_and_action", (q) =>
        q.eq("userId", args.userId).eq("action", args.action)
      )
      .filter((q) => q.gt(q.field("timestamp"), windowStart))
      .collect();

    if (requests.length >= limit.requests) {
      const oldestRequest = requests[0];
      const retryAfter = oldestRequest.timestamp + limit.windowMs - now;

      return { allowed: false, retryAfter };
    }

    // Record this request
    await ctx.db.insert("rateLimits", {
      userId: args.userId,
      action: args.action,
      timestamp: now,
    });

    return { allowed: true };
  },
});

// Use in mutations
export const sendMessage = mutation({
  args: { content: v.string() },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Authentication required");

    // Check rate limit
    const rateCheck = await checkRateLimit(ctx, {
      userId: identity.tokenIdentifier,
      action: "message",
    });

    if (!rateCheck.allowed) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: `Too many requests. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`,
      });
    }

    return await ctx.db.insert("messages", {
      content: args.content,
      authorId: identity.tokenIdentifier,
      createdAt: Date.now(),
    });
  },
});
```

### Service Authentication

External services (e.g., Modal servers, third-party APIs) that need to call Convex functions typically cannot obtain user OpenID JWTs. Implement service-to-service authentication using shared secrets:

```typescript
// convex/serviceAuth.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Shared secret from environment variable (server-side only)
const SERVICE_SECRET = process.env.SERVICE_API_SECRET;

// Service authentication check
export async function requireServiceAuth(ctx: QueryCtx | MutationCtx): Promise<void> {
  // In HTTP actions, check Authorization header
  // In regular functions, verify via argument or environment-based check
  if (!SERVICE_SECRET) {
    throw new Error("Service authentication not configured");
  }

  // Check passed against expected secret
  // Implementation depends on how service calls your functions
}

// Public function for service access
export const processExternalTask = mutation({
  args: {
    secret: v.string(),
    taskId: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    // Verify service authentication
    if (args.secret !== SERVICE_SECRET) {
      throw new ConvexError("Invalid service authentication");
    }

    // Process task
    await ctx.db.insert("tasks", {
      taskId: args.taskId,
      status: "processed",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// For HTTP Actions with JWT authentication
// convex/httpActions.ts
"use node";

import { httpAction } from "./_generated/server";

export const authenticatedEndpoint = httpAction(async (ctx, request) => {
  // Access user identity from Authorization header
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Process request
  return new Response(JSON.stringify({ authenticated: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### Sensitive Operations Protection

```typescript
// convex/admin.ts
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole, requirePermission } from "./lib/auth";
import { internal } from "./_generated/api";

// Two-factor confirmation for dangerous operations
export const deleteAllUserData = mutation({
  args: {
    userId: v.id("users"),
    confirmationCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Require superadmin
    const admin = await requireRole(ctx, "superadmin");

    // Verify confirmation code
    const confirmation = await ctx.db
      .query("confirmations")
      .withIndex("by_admin_and_code", (q) =>
        q.eq("adminId", admin._id).eq("code", args.confirmationCode)
      )
      .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
      .unique();

    if (!confirmation || confirmation.action !== "delete_user_data") {
      throw new ConvexError("Invalid or expired confirmation code");
    }

    // Delete confirmation to prevent reuse
    await ctx.db.delete(confirmation._id);

    // Schedule deletion (don't do it inline)
    await ctx.scheduler.runAfter(0, internal.admin._performDeletion, {
      userId: args.userId,
      requestedBy: admin._id,
    });

    // Audit log
    await ctx.db.insert("auditLogs", {
      action: "delete_user_data",
      targetUserId: args.userId,
      performedBy: admin._id,
      timestamp: Date.now(),
    });

    return null;
  },
});

// Generate confirmation code for sensitive action
export const requestDeletionConfirmation = mutation({
  args: { userId: v.id("users") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "superadmin");

    const code = generateSecureCode();

    await ctx.db.insert("confirmations", {
      adminId: admin._id,
      code,
      action: "delete_user_data",
      targetUserId: args.userId,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    // In production, send code via secure channel (email, SMS)
    return code;
  },
});
```

### Production Security Considerations

When auditing for production deployments, verify backwards compatibility:

**Schema Changes:**
- Schema must always match existing data
- Safe operations: add tables, add optional fields (then set values), mark fields optional (then remove), use union types for transitions
- Never push incompatible schema changes to production

**Function Compatibility:**
- Functions must handle calls from old client versions
- Safe: add new functions, add optional arguments, mark arguments optional, use union types
- Ensure old clients continue to work during deployment

**Scheduled Functions:**
- Scheduled functions run with their deployed version at execution time
- Arguments passed at scheduling must remain valid when function executes
- Ensure backwards compatibility for scheduled function signatures

```typescript
// Example: Backwards-compatible mutation
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()), // Optional for backwards compatibility
    email: v.optional(v.string()),
    // New field added with optional for backwards compatibility
    bio: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) throw new ConvexError("Authentication required");

    // Only update fields that are provided
    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.email !== undefined) updates.email = args.email;
    if (args.bio !== undefined) updates.bio = args.bio;

    return await ctx.db.patch(user._id, updates);
  },
});
```

## Examples

### Complete Audit Trail System

```typescript
// convex/audit.ts
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getUser, requireRole } from "./lib/auth";

const auditEventValidator = v.object({
  _id: v.id("auditLogs"),
  _creationTime: v.number(),
  action: v.string(),
  userId: v.optional(v.string()),
  resourceType: v.string(),
  resourceId: v.string(),
  details: v.optional(v.any()),
  ipAddress: v.optional(v.string()),
  timestamp: v.number(),
});

// Internal: Log audit event
export const logEvent = internalMutation({
  args: {
    action: v.string(),
    userId: v.optional(v.string()),
    resourceType: v.string(),
    resourceId: v.string(),
    details: v.optional(v.any()),
  },
  returns: v.id("auditLogs"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLogs", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

// Admin: View audit logs
export const getAuditLogs = query({
  args: {
    resourceType: v.optional(v.string()),
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(auditEventValidator),
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    let query = ctx.db.query("auditLogs");

    if (args.resourceType) {
      query = query.withIndex("by_resource_type", (q) =>
        q.eq("resourceType", args.resourceType)
      );
    }

    return await query
      .order("desc")
      .take(args.limit ?? 100);
  },
});
```

## Gotchas

- **Provider field differences**: Not all auth providers return the same fields. Always check if optional fields exist before using them (e.g., `identity.email ?? null`)
- **Soft deletes**: If your app uses soft deletes, queries must include `WHERE deleted_at IS NULL` or equivalent, or deactivated accounts will appear in results
- **Service auth secrets**: Environment variables are only available server-side. Never expose service secrets in client-side code or function responses
- **Scheduled function compatibility**: Functions scheduled for future execution will use the version deployed at execution time, not scheduling time
- **Index requirements**: Auth checks that filter by user ID require indexes like `by_user` for efficient queries
- **Error message sanitization**: Don't expose internal details in error messages returned to clients (e.g., don't return external API error strings)
- **TokenIdentifier uniqueness**: `tokenIdentifier` combines `subject` and `issuer` for uniqueness across multiple auth providers
- **Convex Auth is beta**: The built-in Convex Auth library is in beta and may change in backward-incompatible ways
- **HTTP Actions auth**: HTTP actions receive JWT tokens via `Authorization: Bearer <token>` header, not from client auth context

## Best Practices

- Never run `npx convex deploy` unless explicitly instructed
- Never run any git commands unless explicitly instructed
- Implement defense in depth (multiple security layers)
- Log all sensitive operations for audit trails
- Use confirmation codes for destructive actions
- Rate limit all user-facing endpoints
- Never expose internal API keys or errors
- Review access patterns regularly
- Ensure functions are backwards compatible for production
- Use internal functions for operations that shouldn't be public
- Validate all inputs server-side, never trust client data

## Common Pitfalls

1. **Single point of failure** - Implement multiple auth checks
2. **Missing audit logs** - Log all sensitive operations
3. **Trusting client data** - Always validate server-side
4. **Exposing error details** - Sanitize error messages
5. **No rate limiting** - Always implement rate limits
6. **Provider-specific assumptions** - Don't assume all auth providers return the same fields
7. **Forgetting scheduled function compatibility** - Ensure scheduled functions handle old argument formats
8. **Missing backwards compatibility** - Old clients may still connect during deployment

## Audit Checklist

Use this checklist when reviewing Convex application security:

- [ ] Authorization logic exists on all public functions
- [ ] Data access is filtered by user/role
- [ ] API keys and secrets are in environment variables only
- [ ] Rate limiting is implemented on user-facing endpoints
- [ ] Sensitive operations require additional confirmation
- [ ] Audit logs are created for critical operations
- [ ] Error messages don't leak internal information
- [ ] Functions are backwards compatible for production
- [ ] Service authentication uses shared secrets
- [ ] Internal functions are used for non-public operations
- [ ] Indexes exist for common auth-related queries
- [ ] HTTP actions validate Authorization headers

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Functions Auth: https://docs.convex.dev/auth/functions-auth
- Production Security: https://docs.convex.dev/production
- Authentication: https://docs.convex.dev/auth
- Clerk Integration: https://docs.convex.dev/auth/clerk
- Auth0 Integration: https://docs.convex.dev/auth/auth0
- WorkOS AuthKit: https://docs.convex.dev/auth/authkit
- Convex Auth (Beta): https://docs.convex.dev/auth/convex-auth
- Custom JWT Auth: https://docs.convex.dev/auth/advanced/custom-jwt
