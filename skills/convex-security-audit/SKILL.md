---
name: convex-security-audit
description: "Deep security review of a Convex app: authorization model, data access paths per table, HTTP action exposure, rate limiting, file storage access, scheduled function trust, and a written findings report. Use before launch, after an incident, or when the user asks for a full audit rather than a quick check."
---

# Convex security audit

Produces a written findings report covering every public function, every table, and every entry point (HTTP routes, file storage, scheduler). The one rule: every exported `query`, `mutation`, and `action` is a public endpoint anyone on the internet can call with any arguments, so each one must prove who the caller is and what they may touch.

For a ten minute pass, use convex-security-check instead. This skill is the slow, complete version.

## When to reach for this

- Before a production launch or a major release
- After an incident, a leaked key, or suspicious data access
- When the codebase has grown past a handful of public functions and nobody has mapped who can call what
- When adding multi tenant, admin, or billing features
- When the user asks for "a full audit", "security review", or "check the whole backend"

## Reference files

- [references/authorization-patterns.md](references/authorization-patterns.md): open when fixing findings, it has the `getCurrentUser` helper, `customQuery` and `customMutation` wrappers for authed, admin, and tenant scoped access, ownership checks through indexes, and role checks.
- [references/attack-surface.md](references/attack-surface.md): open during steps 4 through 7, it covers HTTP actions, storage URL leakage, scheduler trust, rate limiting with `@convex-dev/rate-limiter`, secrets in env, and client supplied IDs.
- [references/audit-report-template.md](references/audit-report-template.md): open at step 8, it is the findings template and the per table data access matrix to fill in.

## Audit procedure

Work through the steps in order. Record every finding as you go. Do not fix anything until the inventory is complete; fixing early hides the shape of the problem.

### 1. Inventory public functions

List every exported `query`, `mutation`, and `action`. These are the attack surface.

```bash
rg -n "export const \w+ = (query|mutation|action)\(" convex --glob '!**/_generated/**'
```

For each one write down: file, name, type, whether a client needs to call it, and whether it is costly (sends email, calls an LLM, creates records) and so needs a rate limit. Anything only called by other Convex functions, crons, or the scheduler should be `internalQuery`, `internalMutation`, or `internalAction`. Flag each of those as a finding.

### 2. Map auth per function

For every public function from step 1, answer: does it call `ctx.auth.getUserIdentity()` (or a helper that does) before reading or writing? Which functions are intentionally anonymous?

```bash
rg -l "= (query|mutation|action)\(" convex --glob '!**/_generated/**' \
  | xargs rg -L "getUserIdentity|getCurrentUser|authedQuery|authedMutation"
```

Files that print here contain public functions with no auth call anywhere in the file. Read each one. Anonymous is fine for a public blog list. It is a critical finding for anything that returns or writes user data.

Check that auth helpers throw or return early on a missing identity, and that role checks read the role from your `users` table, not from client arguments.

### 3. Map data access per table

For every table in `convex/schema.ts`, list which public functions read it, which write it, and what condition scopes the access (owner ID, org membership, role, public flag). Fill in the data access matrix from the report template.

Look for:

- Reads with no scoping: `ctx.db.query("table").collect()` inside a public function
- `ctx.db.get(args.someId)` followed by a return or patch with no ownership comparison
- Ownership compared against a spoofable value (email, display name) instead of `user._id`
- `.filter()` used for scoping instead of `.withIndex()`; this usually means the scoping was an afterthought
- Return validators that leak fields: `v.any()`, or spreading a full document that carries `passwordHash`, `stripeCustomerId`, or internal flags

```bash
rg -n "v\.any\(\)" convex --glob '!**/_generated/**'
rg -n "ctx\.db\.(get|patch|delete|replace)\(args\." convex --glob '!**/_generated/**'
```

### 4. Review http.ts

Every route in `convex/http.ts` is reachable without a Convex client. For each route check: how is the caller verified (webhook signature, bearer token, `ctx.auth.getUserIdentity()`), is the body validated before use, and does it call only `internal.*` functions with data it has already verified?

```bash
rg -n "http\.route|httpAction\(" convex/http.ts
```

Webhook handlers that skip signature verification are critical. Routes that call `api.*` functions from inside an `httpAction` may be bypassing auth those functions assume they have.

### 5. Review file storage

Find where upload URLs are generated and where file URLs are returned.

```bash
rg -n "storage\.(generateUploadUrl|getUrl|delete)" convex --glob '!**/_generated/**'
```

`generateUploadUrl` in a public mutation with no auth lets anyone fill your storage. A query that returns `ctx.storage.getUrl(args.fileId)` for any ID the client passes is a data leak; the URL works for anyone who holds it.

### 6. Review scheduled and internal boundaries

Internal functions skip auth by design. The question is whether anything schedules them with unverified input.

```bash
rg -n "(runAfter|runAt|runMutation|runAction|interval|cron)\([^)]*\bapi\." convex --glob '!**/_generated/**'
```

Scheduling an `api.*` function is a finding: use `internal.*`. Then trace each `internal.*` call site back to the public function or route that triggered it and confirm the caller validated ownership before scheduling.

### 7. Review env and secrets

```bash
rg -n -i "(sk_live|sk_test|whsec_|AKIA[0-9A-Z]{16}|-----BEGIN|api[_-]?key\s*[:=]\s*['\"][A-Za-z0-9])" convex src --glob '!**/_generated/**'
rg -n "process\.env\." convex src --glob '!**/_generated/**'
```

Secrets belong in Convex environment variables (`npx convex env set NAME value`), read through `process.env` in the action or HTTP action that makes the external call. A secret literal in source is critical. Anything read from `process.env` in client code (`src/`) is public; only non secret `VITE_` or `NEXT_PUBLIC_` values belong there. Confirm dev and prod deployments use different keys.

### 8. Write the report

Fill in [references/audit-report-template.md](references/audit-report-template.md). One finding per issue, ordered by severity, each with location, evidence, and a concrete fix. Include the data access matrix. Finish with the list of public functions reviewed and judged correctly anonymous, so the next auditor does not repeat that work.

## Severity scale

| Severity | Meaning | Examples |
| --- | --- | --- |
| Critical | Any anonymous caller can read or change other users' data, or a secret is exposed | Public mutation patches a document by client supplied ID with no ownership check; API key in source; webhook with no signature check |
| High | An authenticated user can reach data or actions outside their scope | Missing org membership check in a multi tenant query; admin function reads role from client args |
| Medium | Defense in depth gap with no direct exploit today | Public function that should be internal; no rate limit on a costly action; upload URL with no auth |
| Low | Hygiene | `v.any()` on a non sensitive arg; missing return validator; `.filter()` where an index exists |

## Example finding

```
Severity: Critical
Location: convex/tasks.ts, updateTask (mutation, public)
Evidence: handler calls ctx.db.patch(args.taskId, { title: args.title }) after
  requireAuth(ctx) but never compares task.userId to the caller. Any signed in
  user can rename any task by guessing or capturing an ID.
Fix: load the task, compare task.userId to user._id, throw on mismatch. See
  references/authorization-patterns.md, "Ownership checks".
Verified: reproduced by calling updateTask with another user's task ID from the
  dashboard function runner.
```

## Common mistakes

| Mistake | Why it breaks | Do this instead |
| --- | --- | --- |
| Treating `internalMutation` as safe without tracing callers | The public function that schedules it may pass unverified IDs | Audit the scheduling call site, not just the internal function |
| Checking auth only in the UI | Anyone can call the function from the dashboard or a script | Every public handler checks identity itself |
| Comparing ownership to `identity.email` | Emails can be reused or unverified across providers | Compare to `user._id` looked up via `tokenIdentifier` |
| Mixing `return null` and `throw` for the same case | Leaks record existence through response differences | In queries, return `null` for both "not found" and "not yours" |
| Rate limiting only in the client | Attackers skip the client | Use `@convex-dev/rate-limiter` inside the mutation or action |
| Signing off after fixes without re running the greps | Fixes often move the problem | Re run steps 1 through 7 after remediation |

## Checklist

- [ ] Every exported `query`, `mutation`, `action` is listed with its intended caller
- [ ] Every function that should be internal is `internal*`
- [ ] Every public function either checks identity or is documented as intentionally anonymous
- [ ] Every table has a filled row in the data access matrix
- [ ] Every `http.ts` route verifies its caller and validates its body
- [ ] Upload URL generation and file URL reads are gated by ownership
- [ ] No `api.*` reference inside scheduler, cron, or `ctx.run*` calls
- [ ] No secret literals in source; dev and prod use different keys
- [ ] Costly or abusable mutations and actions are rate limited
- [ ] Report written with severity, location, evidence, and fix for each finding

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/auth/functions-auth
- https://docs.convex.dev/functions/internal-functions
- https://docs.convex.dev/functions/http-actions
- https://docs.convex.dev/production/environment-variables
