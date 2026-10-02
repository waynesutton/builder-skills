---
name: convex-security-check
description: "Ten minute security pass over a Convex backend: public functions that should be internal, missing auth checks, unvalidated args, IDs from the client trusted without ownership checks, secrets in code. Use before merging a pull request, after adding new public functions, or when the user says 'quick security check'."
---

# Convex security check

A ten minute pass over `convex/` that catches the mistakes that ship most often. The one rule: every exported `query`, `mutation`, and `action` is a public endpoint anyone can call with any arguments, so each one must check identity and ownership or be intentionally anonymous.

Run each grep, read what it surfaces, fix or file. This skill finds problems; it does not map the whole system. For that, hand off to convex-security-audit.

## When to reach for this

- Before merging a pull request that touches `convex/`
- After adding or renaming public functions
- The user says "quick security check", "sanity check the backend", or "anything obviously wrong here"
- Before a dev to prod push, when there is no time for a full audit

## Checklist

Run the commands from the project root. Every grep excludes `_generated`.

### 1. Public vs internal

Anything only called by other Convex functions, the scheduler, crons, or webhooks should be `internalQuery`, `internalMutation`, or `internalAction`.

```bash
rg -n "export const \w+ = (query|mutation|action)\(" convex --glob '!**/_generated/**'
rg -n "\bapi\.\w+\.\w+" convex --glob '!**/_generated/**'
```

The second grep finds `api.*` used inside the backend. Server code scheduling or running a public function is almost always a sign that function should be internal.

- [ ] Every public function has a client that needs to call it
- [ ] No `api.*` inside `ctx.scheduler.*`, `ctx.run*`, or `crons.*`
- [ ] Admin only operations (role changes, credit grants, deletions across users) are internal

### 2. Auth

```bash
rg -l "= (query|mutation|action)\(" convex --glob '!**/_generated/**' \
  | xargs rg -L "getUserIdentity|getCurrentUser|authedQuery|authedMutation"
```

Files listed contain public functions and no auth call at all. Open each one. A public post list is fine anonymous. Anything that returns or writes user data is not.

- [ ] Every public function checks identity or is documented as intentionally anonymous
- [ ] Auth helpers throw or return early when identity is missing
- [ ] Roles come from the `users` table, never from client arguments

### 3. Validation

```bash
rg -nU "(query|mutation|action)\(\{\s*handler" convex --glob '!**/_generated/**'
rg -n "v\.any\(\)" convex --glob '!**/_generated/**'
```

The first grep finds functions whose definition starts with `handler`, meaning no `args`. The second finds `v.any()`, which turns off validation for that field.

- [ ] Every function has `args` and `returns` validators
- [ ] No `v.any()` on arguments that reach the database or an external API
- [ ] Return validators list fields explicitly so `passwordHash`, `stripeCustomerId`, and internal flags cannot leak

### 4. Ownership and IDs

`v.id("tasks")` proves the string is a valid ID for that table. It does not prove the caller owns the document.

```bash
rg -n "ctx\.db\.(get|patch|delete|replace)\(args\." convex --glob '!**/_generated/**'
rg -n "userId: v\.(id|string)\(" convex --glob '!**/_generated/**'
```

For each hit in the first grep, find the ownership comparison between the read and the write. For the second, a public function that accepts the caller's own `userId` as an argument is trusting the client to say who it is.

- [ ] Every `get`, `patch`, `delete`, `replace` by a client supplied ID is followed by an ownership or membership check
- [ ] Caller identity is derived from `ctx.auth`, never accepted as an argument
- [ ] Lists use `withIndex` on the owner field, not a full scan plus filter

### 5. Secrets

```bash
rg -n -i "(sk_live|sk_test|whsec_|AKIA[0-9A-Z]{16}|-----BEGIN|api[_-]?key\s*[:=]\s*['\"][A-Za-z0-9])" convex src --glob '!**/_generated/**'
rg -n "process\.env\." src
```

Anything in `src/` that reads `process.env` or `import.meta.env` ships to the browser. Only deployment URLs and public client IDs belong there.

- [ ] No secret literals in `convex/`, `src/`, tests, or fixtures
- [ ] Secrets read from `process.env` inside the action or HTTP action that uses them
- [ ] Dev and prod deployments use different keys

### 6. HTTP and storage

```bash
rg -n "http\.route|httpAction\(" convex/http.ts
rg -n "storage\.(generateUploadUrl|getUrl)" convex --glob '!**/_generated/**'
```

- [ ] Every `http.ts` route verifies its caller (webhook signature, bearer token, or `getUserIdentity`) before parsing the body
- [ ] Routes call `internal.*`, not `api.*`
- [ ] `generateUploadUrl` requires auth
- [ ] `getUrl` is called on a storage ID read from a document the caller owns, never on a storage ID passed by the client

## One fix, before and after

The most common finding: auth is checked, ownership is not.

Before:

```typescript
export const updateTask = mutation({
  args: { taskId: v.id("tasks"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in required");
    // any signed in user can rename any task
    await ctx.db.patch(args.taskId, { title: args.title });
    return null;
  },
});
```

After:

```typescript
import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getCurrentUser } from "./lib/auth";

export const updateTask = mutation({
  args: { taskId: v.id("tasks"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx); // throws when signed out
    const task = await ctx.db.get(args.taskId);
    // same error for missing and not owned, so IDs cannot be probed
    if (!task || task.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found" });
    }
    await ctx.db.patch(args.taskId, { title: args.title });
    return null;
  },
});
```

`getCurrentUser` looks the user up through a `by_tokenIdentifier` index using `identity.tokenIdentifier` and throws when there is no identity. Define it once in `convex/lib/auth.ts` and use it everywhere.

## Common mistakes

| Mistake | Why it breaks | Do this instead |
| --- | --- | --- |
| Checking auth in the React component only | Anyone can call the function from the dashboard or a script | Check in the handler |
| `v.id("users")` argument for "the current user" | Client can pass any user's ID | Derive from `ctx.auth.getUserIdentity()` |
| Comparing ownership to `identity.email` | Emails can be reused or unverified | Compare to `user._id` |
| `internalMutation` treated as safe on its own | The public caller may pass unverified IDs | Check the call site too |
| Fixing one hit and moving on | The same pattern usually appears in siblings | Fix all hits from the grep |

## Hand off to convex-security-audit

Stop and run the full audit when any of these are true:

- More than two or three findings in steps 2 or 4; the pattern is systemic
- The app has multi tenant data (orgs, teams, workspaces)
- `http.ts` has webhook routes or routes that return user data
- Files are uploaded and served
- The user asks for a report, a launch review, or a post incident review

The audit maps auth per function, data access per table, HTTP exposure, storage, scheduler trust, rate limiting, and produces a written findings report. This check does not.

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/auth/functions-auth
- https://docs.convex.dev/functions/internal-functions
- https://docs.convex.dev/functions/validation
