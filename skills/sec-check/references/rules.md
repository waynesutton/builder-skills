# Rules

Every rule comes from a mistake that already shipped. Each one names the incident, then the rule. Fix code for each rule is in the patterns reference.

## Contents

- 1. Secrets never enter git
- 2. Client prefixes publish the value
- 3. Every public function is an open endpoint
- 4. Signed in is not admin
- 5. Paid calls need auth, limits, and caps
- 6. The server owns the model
- 7. Seed, setup, migrate, and debug functions are internal
- 8. Agent tools that act need the owner
- 9. Webhooks verify before they parse
- 10. Uploads are typed, sized, and never served as pages
- 11. User markdown and HTML are sanitized twice
- 12. One visibility check for every read path
- 13. Public queries return projections
- 14. Templates and demos ship safe defaults
- 15. Stored content and model output are untrusted
- 16. Derived copies follow the source
- 17. Bounded reads and bounded cost
- 18. CI and the supply chain are code
- 19. Client sinks
- 20. Auth config and ids
- Component boundaries
- AI generated code checks
- One fix, before and after (rule 3)
- Common mistakes

## 1. Secrets never enter git

Incidents: Clerk `sk_live_` keys and a webhook secret committed in `.env` files on two public repos. A production Convex deploy key committed in `netlify.toml`, which let anyone push code to prod.

- `.env*` is in `.gitignore` before the first commit. Ship `.env.example` with names and empty values.
- Deploy keys live only in the host dashboard (Netlify, Vercel), never in `netlify.toml`, `vercel.json`, CI yaml, or docs.
- Build output (`.next/`, `dist/`) is never committed. It can carry server keys.
- Run `gitleaks protect --staged` in a pre-commit hook and turn on GitHub push protection.
- A key in docs, tests, examples, or dead code still counts. Anyone who reads the repo gets it. A file named `test` or `example` does not prove the value is a dummy, and unknown validity lowers confidence, not severity to zero.
- Never test a found key against the provider to see if it works. Rotate it.

## 2. Client prefixes publish the value

Incidents: a Clerk secret stored as `VITE_CLERK_SECRET_KEY`. READMEs telling people to set `VITE_OPENAI_API_KEY` and `VITE_CLAUDE_API_KEY`. A vendored sample reading `NEXT_PUBLIC_OPENAI_API_KEY`.

- `VITE_`, `NEXT_PUBLIC_`, `EXPO_PUBLIC_`, `PUBLIC_`, and `REACT_APP_` values are compiled into JavaScript anyone can download. Only deployment URLs, publishable keys, and client ids belong there.
- Secrets go in Convex env (`npx convex env set`) and are read inside actions or HTTP actions.
- Docs, setup guides, and agent rules count. A wrong env name in a README ships someone else's key.
- Never use `dangerouslyAllowBrowser` with an AI SDK.
- Declare required server env in `convex/convex.config.ts` so a missing secret fails the deploy instead of failing at runtime. See the patterns reference, section 5. The ledger lists env reads that are not declared.

## 3. Every public function is an open endpoint

Incidents: an agent dashboard whose password login only gated the React UI and left every admin mutation public. Templates with Clerk wired on the frontend and zero server auth checks. A tool with 232 public functions and 2 auth checks lost 28 tables to someone holding only the URL.

- Sign in gating, `<Authenticated>`, route guards, and domain allowlists control the UI, not the API.
- Default to authed builders from `convex/access.ts` (`authedQuery`, `authedMutation`, `authedAction`). Import raw `query` or `mutation` only for intentionally public functions.
- Mark intentionally public files or functions with `// sec-check: public` and give them a trimmed `returns` validator. The scanner and ledger honor the marker.
- Derive identity from `ctx.auth`. Never accept the caller's `userId`, `authorId`, `userName`, or `isAdmin` as an argument. After `ctx.db.get(id)`, check ownership and throw the same `NOT_FOUND` for missing and not owned.
- Check every function on its own. One correct check in a file says nothing about the next export down.
- A `v.id()` arg stored on a new row (`projectId`, `boardId`, `roomId`, `conversationId`) needs the parent checked too: load it and confirm the caller owns it or is a member. Writing into someone else's container is the same bug as editing their row, and it survives an identity arg fix. Impact depends on reads: if every read of that table is also scoped by the caller's id, it is a hardening note.
- Compare owner fields against the same kind of value they store. A field typed `v.id("users")` never equals `identity.subject`, so the check either locks every owner out or gets loosened until it passes. Resolve the caller's `users` row through the `tokenIdentifier` index and compare `_id`.
- A public query that takes a client id and returns email, phone, revenue, or keys for that id is a leak even though it only reads.

## 4. Signed in is not admin

Incident: a security scan action commented "admin only" that only checked for a session, so any user could spend Socket.dev and Snyk quota and post to the team Slack.

- Admin paths call `requireAdmin`, which reads the role from your users table.
- Never trust `isAdmin`, `role`, or `keyType` from args.
- `requireAdmin(ctx, args.clerkId)` is not a check. A helper that looks up the user by an ID the caller passed only proves the caller knows the admin's ID. Read the subject from `ctx.auth.getUserIdentity()` inside the helper.
- A comment saying admin only is not a check. The ledger flags TODO and FIXME comments about auth. Verify each one.

## 5. Paid calls need auth, limits, and caps

Incidents: a live AI chat template exposing public actions that took any message array, including the system role, with no auth or limit. In practice it was a free GPT, Claude, and Grok proxy. A ranking site whose public mutation fetched any GitHub profile with no throttle, burning the shared token. Public text to speech actions on ElevenLabs. Public X actions that loaded an agent owner's stored xAI key for any caller.

- The client calls a mutation. The mutation authenticates or keys anonymous callers by IP with `ctx.meta.getRequestMetadata()`, applies `@convex-dev/rate-limiter` per user plus a global ceiling, caps input size, then schedules an `internalAction`. See the patterns reference, section 3.
- Never rate limit on a key the client supplies, such as a random `sessionId`. Attackers rotate it.
- A stored credential is loaded for `ctx.auth`'s user, never for an owner id that came from args or from a document the caller picked.
- Cache or dedupe expensive work (skip a refetch done in the last N hours).
- Use the Convex AI Gateway for apps with real sign in, so no provider key exists to leak. It removes leak risk, not cost risk: a signed out caller reaching `getServiceToken("ai-gateway")` is an open proxy on your Convex invoice. Gate it on `ctx.auth.getUserIdentity()`, add per user limits, and set a team spending limit. Never return, store, or cache the service token.
- Public apps with no real login (or anonymous sign in only) use bring your own key: the visitor's key is passed to an action and used inside that action, and the server holds no provider key. Never pass a user key through `ctx.scheduler`, since scheduled function args are stored in `_scheduled_functions`. See the patterns reference, section 12.
- Set hard monthly spend caps in every provider dashboard and Convex usage limits on the deployment (rule 17).

## 6. The server owns the model

Incident: unauthenticated mutations let anyone rewrite an agent's system prompt, switch its model, and set a provider `baseUrl`.

- Clients never send the system prompt, model id, provider, base URL, temperature ceiling, or max tokens. Accept a short enum at most and map it on the server.
- Strip `system` from any client message array.
- Config that changes agent behavior is an admin mutation.

## 7. Seed, setup, migrate, and debug functions are internal

Incidents: public `seed.all`, `setup.complete`, `initializeSettings`, `fixUserSchema`, `addTestSnippets`, and `backfill` mutations on live deployments.

- Use `internalMutation` and run them with `npx convex run`. Scheduled and cron targets use `internal.*`, never `api.*`. The ledger flags `ctx.scheduler` calls into `api.*`.
- Delete debug and test data functions before deploy.

## 8. Agent tools that act need the owner

Incident: a public `postTweet` action could post from the owner's X account, and a public `apiKeys.create` let anyone mint an admin API key.

- Tools that post, email, pay, delete, or mint credentials are internal and run only from an admin path or an approved agent run.
- Use `needsApproval` on `createTool` in the Agent component for side effects a human should see first. See the patterns reference, section 14.
- Log every side effect with an actor label like `AI` or `System`.

## 9. Webhooks verify before they parse

Incidents: an AgentMail inbound webhook and an Attio webhook that processed any POST.

- Verify the signature on the raw body before `JSON.parse` and before any write. Use Svix for Clerk, Resend, and AgentMail, HMAC for GitHub style, `constructEventAsync` for Stripe, and Ed25519 for Discord. See the patterns reference, section 6.
- HTTP routes call `internal.*` functions only.
- Restrict CORS on routes that return private data. CORS `*` is fine for public content.

## 10. Uploads are typed, sized, and never served as pages

Incident: a storage proxy on the main domain served any uploaded file with its stored content type, so an uploaded HTML or SVG file would run on that origin.

- `generateUploadUrl` requires auth and a rate limit.
- After upload, read `ctx.db.system.get(storageId)`, check `contentType` and `size`, and delete rejects.
- Do not proxy storage through your app origin. If you must, allowlist raster images and send `nosniff` plus a sandbox CSP.

## 11. User markdown and HTML are sanitized twice

Incident: submitter markdown rendered through `rehype-raw` with no sanitizer, so an `<iframe srcdoc>` ran script on a company domain. A comment renderer that fell back to raw HTML, behind a mutation that let anyone post as any user.

- Render with `rehype-sanitize` after `rehype-raw`, or with DOMPurify before `dangerouslySetInnerHTML`.
- Strip script capable HTML on write too, so APIs, `llms.txt`, and exports stay clean.
- Ship a Content Security Policy as the backstop. Prefer headers. Use a meta tag when an edge function skips header rules.

## 12. One visibility check for every read path

Incident: unapproved submissions were hidden on the page but still served through the markdown, `SKILL.md`, `llms.txt`, REST, and OG routes.

- Content with a status gets one predicate like `isPublicItem(doc)`, used by every query, HTTP route, sitemap, feed, export, and search.
- Owners and admins take a separate path that checks identity first.

## 13. Public queries return projections

Incident: public profile queries returned `email` and `clerkId` until a later fix stripped them.

- Map to an explicit `returns` validator. Never return a raw document from a public function.
- Mutations return ids or `null`, not the stored object.
- Everything a query returns is visible in the WebSocket frames in DevTools.

## 14. Templates and demos ship safe defaults

Incidents: hackathon demos and a workshop app left running with live AI keys and public AI entry points.

- A template copied by others must be secure out of the box: auth on writes, limits on paid calls, internal seed functions, `.env.example` only.
- Add a security section to the README listing required env vars and what is public by design.
- Pause the Convex deployment or remove provider keys when a demo ends.

## 15. Stored content and model output are untrusted

Agents read comments, emails, web pages, files, and memory that other people wrote. That text can carry instructions.

- Text an agent reads is data, never instructions. Wrap it in clear delimiters and never let it pick the tool, the recipient, or the owner.
- Tool args come from the model, so a tool validates them like a public mutation: re-check ownership of every id inside the tool, against the user who started the run.
- An agent acting for user A never loads user B's memory, thread, or credentials. Scope `userId` from the run, not from tool args.
- Bind approval to the exact call. An approved "send email to X" must not run with a changed recipient.
- Cap `maxSteps` and tool calls per run. A loop that schedules itself is a cost bug.
- Model output rendered as HTML or markdown goes through rule 11. Links from model output get the same checks as user links (rule 19).

## 16. Derived copies follow the source

Search indexes, vector embeddings, caches, exports, digests, and file URLs are copies. Each copy needs the same access check as the row it came from.

- Vector and text search results are filtered by owner or visibility in the same query or right after, before anything returns.
- `ctx.storage.getUrl()` returns a URL anyone can open. Treat it as a bearer link: return it only to callers who passed the row's access check.
- Deleting a user or item deletes its comments, embeddings, files, scheduled jobs, and stored keys. Grep for every table holding its id.
- Status changes (approved to hidden, public to private) apply to every derived copy through the rule 12 predicate.

## 17. Bounded reads and bounded cost

Abuse that does not leak data can still take an app down or run up a bill.

- Public queries use `.take(n)` or `.paginate()`, not `.collect()` on tables that grow. Turn on `@convex-dev/no-collect-in-query`.
- Number args shaped like a score, vote, amount, or quantity get a bound and an integer check on the server. `v.number()` accepts `-1e9` and `Infinity`. Better: compute scores on the server from recorded answers, never accept them from the client.
- One request never schedules an unbounded number of jobs or emails. Cap fan out per call and per user.
- Set Convex usage limits on prod with a warning threshold. A disable threshold turns the whole deployment off when hit, so an attacker driving cost can turn a bill problem into an outage. Pick disable levels with that in mind.
- For layer 7 rate limits or a WAF, put the deployment behind your own Cloudflare zone, or a Vercel rewrite for HTTP actions only. Convex handles layer 3 and 4.
- Avoid `Date.now()` in queries. It breaks caching and makes reads more expensive.

## 18. CI and the supply chain are code

- A `pull_request_target` workflow that checks out the PR head runs strangers' code with your secrets. Use `pull_request` or never check out the head.
- `CONVEX_DEPLOY_KEY` lives only in protected environments that run on your default branch. Preview deploy keys are for preview builds.
- Commit a lockfile. Run `npm audit --omit=dev` and fix advisories in auth and crypto packages first.
- Vendored folders like `.agents/skills`, `.cursor/rules`, and copied samples ship in the repo and get scanned like your code.

## 19. Client sinks

- User supplied URLs in `href` or `src` allow `https:` only. `javascript:` links run on click.
- Redirects after sign in go to a relative path or an allowlist, never a raw `?next=` value.
- `postMessage` listeners check `event.origin` against an exact allowlist.
- BYOK keys stay in memory or `sessionStorage` by default, `localStorage` only when the visitor opts in, with a clear button. Never in a Convex table, a log, or an analytics event.

## 20. Auth config and ids

- `convex/auth.config.ts` sets `applicationID` for every provider. Without it Convex skips the `aud` check, so a token minted for another app on a shared issuer like `accounts.google.com` signs in to yours.
- Key users on `tokenIdentifier` (issuer plus subject) when more than one provider is configured. `subject` alone can collide.
- Use explicit table ids: `ctx.db.get("tasks", id)`. The `explicit-table-ids` lint rule and `npx @convex-dev/codemod@latest explicit-ids` convert old calls. It stops an id from one table being passed where another was expected.

## Component boundaries

Convex components are sandboxed, which changes where auth lives. Per the [authoring docs](https://docs.convex.dev/components/authoring):

- `ctx.auth` is not available inside a component. Authenticate in the app function first, then pass identifiers like `userId` into the component. Review every `ctx.runQuery`/`ctx.runMutation` into `components.*` and confirm the calling app function did the auth check before the call.
- Component functions are not exposed to clients. The app's own public functions wrap them, so the wrapper is where authorization must happen. A safe component behind an unguarded public wrapper is still a leak.
- Component HTTP actions have no `ctx.auth` and no app environment variables. If a component route needs to authenticate users, the handler belongs in the app's `convex/http.ts`, mounted from the component's client code.
- Component HTTP routes are only reachable when the app passes `httpPrefix` at install time in `convex.config.ts`. Review every `httpPrefix` as a deliberate expansion of the public HTTP surface and check what those routes serve.
- Components declare their own environment variables and cannot read the app's. When an app passes secrets to a component, confirm it passes only what the component needs.

## AI generated code checks

- Watch for missing `returns` validators.
- Watch for public `query` or `mutation` usage where `internal*` should be used.
- Watch for `ctx.db.get()` plus client supplied ids in ownership checks.
- Watch for full objects returned from public queries or mutations.
- Watch for vague or over detailed error messages that leak internal state.
- Watch for public functions with no auth reference at all. AI agents reliably add validators and indexes because the rules demand them, and reliably skip handler auth because nothing demands it. Assume every generated public function is open until you see the check.
- Watch for auth configured but never enforced: an `auth.config.ts`, a users table, a sign-in flow, and a backend that never asks. Wiring a provider is not the same as gating functions.
- Watch for scheduler and cron targets using `api.*` references where `internal.*` is required.

## One fix, before and after (rule 3)

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
| Checking auth in the React component only | Anyone can call the function with `curl` or a script | Check in the handler |
| `v.id("users")` argument for "the current user" | The client can pass any user's id | Derive it from `ctx.auth.getUserIdentity()` |
| Comparing ownership to `identity.email` | Emails can be reused or unverified across providers | Compare to `user._id` looked up through `tokenIdentifier` |
| Treating `internalMutation` as safe without tracing callers | The public function that calls or schedules it may pass unverified ids | Audit the call site, not just the internal function |
| Mixing `return null` and `throw` for the same case | Response differences reveal which records exist | Return the same result for "not found" and "not yours" |
| Rate limiting only in the client | Attackers skip the client | Use `@convex-dev/rate-limiter` inside the mutation or action |
| Fixing one hit and moving on | The same pattern usually appears in sibling functions | Fix every hit, then rerun the scanner and ledger |
