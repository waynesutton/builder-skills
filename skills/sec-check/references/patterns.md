# sec-check fix patterns

Copy these into a project when a finding needs a fix. Each pattern matches a rule in SKILL.md. Adjust table and index names to the project schema.

## Contents

1. Authed function builders
2. Admin check from the database
3. Paid AI call gate with rate limits
4. AI Gateway with no provider keys
5. Declared environment variables
6. Webhook signature verification
7. Upload checks
8. Public query projection
9. One visibility predicate
10. Safe markdown rendering and CSP
11. Rotation and history purge
12. Bring your own key for public apps
13. Convex lint plugin
14. Agent tools and untrusted context
15. Bounded reads and fan out
16. Storage URLs and delete cascades
17. CI deploy keys and pull requests
18. SECURITY.md for a Convex app

## 1. Authed function builders

New functions import from `./access`, never from `./_generated/server`, unless the file is intentionally public.

```ts
// convex/access.ts
import { ConvexError } from "convex/values";
import {
  customQuery,
  customMutation,
  customAction,
  customCtx,
} from "convex-helpers/server/customFunctions";
import {
  query,
  mutation,
  action,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";

// Resolve the signed in user from the users table, or throw
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) throw new ConvexError({ code: "UNAUTHENTICATED" });
  return user;
}

export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);

// Actions have no ctx.db, so they get the identity only
export const authedAction = customAction(
  action,
  customCtx(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });
    return { identity };
  }),
);
```

Usage keeps the normal shape, with `ctx.user` available:

```ts
export const rename = authedMutation({
  args: { taskId: v.id("tasks"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    // Same error for missing and not owned so ids cannot be probed
    if (!task || task.userId !== ctx.user._id) {
      throw new ConvexError({ code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.taskId, { title: args.title });
    return null;
  },
});
```

Install: `npm install convex-helpers`.

## 2. Admin check from the database

Signed in is not admin. Read the role from your own table, never from args or a client flag.

```ts
// convex/access.ts (continued)
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError({ code: "FORBIDDEN" });
  return user;
}

export const adminQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireAdmin(ctx) })),
);

export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireAdmin(ctx) })),
);
```

For admin actions, call an `internalQuery` that runs `requireAdmin` logic against the identity, or start the action from an `adminMutation` that schedules it.

## 3. Paid AI call gate with rate limits

The client calls a mutation. The mutation checks auth or an anonymous key, enforces limits, caps input, then schedules an `internalAction`. The client never reaches the provider directly and never picks the model, system prompt, or base URL.

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp();
app.use(rateLimiter);
export default app;
```

```ts
// convex/limits.ts
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  aiPerUser: { kind: "token bucket", rate: 30, period: HOUR, capacity: 5 },
  aiPerIp: { kind: "token bucket", rate: 10, period: HOUR, capacity: 3 },
  // Global ceiling protects the bill even if per key limits are bypassed
  aiGlobal: { kind: "fixed window", rate: 2000, period: HOUR },
});
```

```ts
// convex/ai.ts
import { mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { rateLimiter } from "./limits";

const MAX_PROMPT_CHARS = 2000;

export const ask = mutation({
  args: { prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prompt = args.prompt.trim();
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
      throw new ConvexError({ code: "INVALID_INPUT" });
    }
    const identity = await ctx.auth.getUserIdentity();
    // Anonymous callers are keyed by IP; null means not an HTTP request
    const { ip } = await ctx.meta.getRequestMetadata();
    if (identity) {
      await rateLimiter.limit(ctx, "aiPerUser", {
        key: identity.tokenIdentifier,
        throws: true,
      });
    } else {
      await rateLimiter.limit(ctx, "aiPerIp", {
        key: ip ?? "unknown",
        throws: true,
      });
    }
    await rateLimiter.limit(ctx, "aiGlobal", { throws: true });
    await ctx.scheduler.runAfter(0, internal.ai.generate, { prompt });
    return null;
  },
});

export const generate = internalAction({
  args: { prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Server owns model, system prompt, and max tokens
    // call provider here, then ctx.runMutation(internal.ai.save, ...)
    return null;
  },
});
```

`ctx.meta.getRequestMetadata()` works in mutations, actions, and HTTP actions. If `ctx.meta` is missing, upgrade `convex`. Test with `t.withRequestMetadata({ ip: "203.0.113.7" })` in `convex-test`.

Set a hard monthly spend limit in every provider dashboard. Limits in code protect against abuse. Spend caps protect against bugs in your limits.

## 4. AI Gateway with no provider keys

The Convex AI Gateway authenticates with a short lived service token, so there is no OpenAI or Anthropic key to leak. Needs `convex` 1.45 or later.

```ts
"use node";
import OpenAI from "openai";
import { getServiceToken } from "convex/server";

const openai = new OpenAI({
  baseURL: "https://ai-gateway.convex.dev/v1",
  apiKey: () => getServiceToken("ai-gateway"),
});
```

With the Vercel AI SDK or the Agent component, use `convexGateway("openai/gpt-4o-mini")` from `@convex-dev/ai-sdk-provider` (0.2.1 or later; Agent and RAG need `convex` 1.46 or later). The rate limit gate from pattern 3 still applies. Removing the key removes leak risk, not cost risk.

Rules:

- Only signed in users reach gateway calls. Check `ctx.auth.getUserIdentity()` before minting a token, then rate limit per user and globally.
- Needs a paid Convex plan. Free plan throws `AiGatewayDisabled`, self hosted throws `AiGatewayUnavailable`. Map both to a clear "AI is not configured" message.
- Set a team spending limit and a deployment AI Gateway usage limit with a warning threshold. The disable threshold turns off the whole deployment.
- Never return the token to a client, store it in env, or cache it. The runtime caches it.
- No secret travels in args, so gateway calls may be scheduled from an authed mutation. BYOK calls may not.
- Public apps with no login stay on bring your own key (pattern 12). A fork that adds auth can switch with `AI_MODE=gateway`.

## 5. Declared environment variables

Declare every variable the backend needs. Deploys fail when one is missing, and the dashboard and CLI refuse to remove a required one.

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp({
  env: {
    CLERK_WEBHOOK_SECRET: v.string(),
    OPENAI_API_KEY: v.optional(v.string()),
    APP_ENV: v.union(v.literal("dev"), v.literal("prod")),
  },
});
app.use(rateLimiter);
export default app;
```

```ts
import { internalAction, env } from "./_generated/server";
// env.CLERK_WEBHOOK_SECRET is typed as string
```

Set values with `npx convex env set NAME 'value'`. Ship a `.env.example` with names and empty values only.

## 6. Webhook signature verification

Verify before parsing JSON and before any write. Hand the verified payload to an `internalMutation`.

Svix based providers (Clerk, Resend, AgentMail):

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const payload = await req.text();
    const headers = {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    };
    let event: { type: string; data: unknown };
    try {
      event = new Webhook(process.env.CLERK_WEBHOOK_SECRET!).verify(
        payload,
        headers,
      ) as { type: string; data: unknown };
    } catch {
      return new Response("Invalid signature", { status: 401 });
    }
    await ctx.runMutation(internal.users.applyClerkEvent, {
      type: event.type,
      data: event.data,
    });
    return new Response(null, { status: 200 });
  }),
});

export default http;
```

Generic HMAC SHA256 (GitHub, Slack style, Attio, custom). `crypto.subtle.verify` compares in constant time:

```ts
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^sha256=/, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(clean)) {
    return new Uint8Array();
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function verifyHmacSha256(
  secret: string,
  body: string,
  signatureHex: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(signatureHex),
    enc.encode(body),
  );
}
```

Stripe: prefer the `@convex-dev/stripe` component, or `stripe.webhooks.constructEventAsync(body, sig, secret, undefined, Stripe.createSubtleCryptoProvider())`. Discord interactions: verify Ed25519 with `DISCORD_PUBLIC_KEY`.

## 7. Upload checks

```ts
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export const generateUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await rateLimiter.limit(ctx, "uploads", {
      key: ctx.user._id,
      throws: true,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveAvatar = authedMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const meta = await ctx.db.system.get(args.storageId);
    if (
      !meta ||
      !ALLOWED_IMAGE_TYPES.has(meta.contentType ?? "") ||
      meta.size > MAX_BYTES
    ) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({ code: "INVALID_FILE" });
    }
    await ctx.db.patch(ctx.user._id, { avatarId: args.storageId });
    return null;
  },
});
```

Convex storage URLs live on the deployment domain, which isolates them from your app origin. The danger starts when you proxy storage through your own domain or an HTTP action. If you must, allowlist raster image types, send `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`, and return 404 for everything else. Never serve uploaded HTML or SVG from the app origin.

## 8. Public query projection

```ts
const publicProfile = v.object({
  _id: v.id("users"),
  name: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
});

export const getProfile = query({
  args: { userId: v.id("users") },
  returns: v.union(publicProfile, v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    // Never return the raw doc: email, clerkId, role, and notes stay server side
    return { _id: user._id, name: user.name, avatarUrl: user.avatarUrl ?? null };
  },
});
```

Frontend types come from `FunctionReturnType<typeof api.users.getProfile>` so the UI cannot depend on fields you strip later.

## 9. One visibility predicate

When content has a review or publish state, every read path must use the same check: page queries, list queries, HTTP routes, OG meta, sitemap, RSS, `llms.txt`, `SKILL.md`, markdown and REST exports, search.

```ts
// convex/lib/visibility.ts
import type { Doc } from "../_generated/dataModel";

export function isPublicItem(item: Doc<"items">): boolean {
  return (
    item.status === "approved" &&
    !item.hidden &&
    !item.archived &&
    !item.pendingDeletion
  );
}
```

Owners and admins get a separate code path that checks identity first. Everyone else gets `null` and a 404.

## 10. Safe markdown rendering and CSP

Prefer plain `react-markdown` with no raw HTML. If raw HTML is required, sanitize after parsing:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

export function SafeMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // Sanitize must run after rehype-raw
      rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}
    >
      {content}
    </ReactMarkdown>
  );
}
```

For `dangerouslySetInnerHTML`, run `DOMPurify.sanitize(html)` first. For content that is also served outside React (APIs, `llms.txt`, exports), strip script capable HTML on write too.

Add a CSP as the backstop. Use response headers when the host applies them. If HTML goes through an edge function that skips header rules, use a meta tag in `index.html`:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="object-src 'none'; base-uri 'self'; script-src 'self'; frame-ancestors 'self'"
/>
```

Add hashes or hosts to `script-src` for any inline script or analytics loader, then load every page in a preview build and confirm no violations.

## 11. Rotation and history purge

Rotate first. A rotated key in history is harmless. An unrotated key is live no matter how clean history looks.

| Leaked | Where to rotate |
| --- | --- |
| Convex deploy key | Dashboard, deployment, Settings, Deploy Keys: revoke and recreate |
| Clerk secret key | Clerk dashboard, API Keys: roll secret (prod and dev instances separately) |
| Clerk webhook secret | Clerk dashboard, Webhooks, endpoint: roll signing secret |
| OpenAI, Anthropic, Google, xAI, Groq, Mistral | Provider console, API keys: delete and create |
| Stripe | Developers, API keys: roll secret key and webhook signing secret |
| Resend, Firecrawl, ElevenLabs, AgentMail | Dashboard API keys: revoke and create |
| GitHub token | Settings, Developer settings, tokens: delete and create fine grained |
| WorkOS | Dashboard, API Keys: roll |

Then purge:

```bash
brew install git-filter-repo
git clone --mirror https://github.com/OWNER/REPO.git && cd REPO.git
git filter-repo --path .env --invert-paths            # drop a file everywhere
printf 'PASTE_SECRET==>REMOVED\n' > ../replace.txt     # or replace a string
git filter-repo --replace-text ../replace.txt
git push --force --mirror
```

After a purge, collaborators reclone, and GitHub support can clear cached views of removed commits.

## 12. Bring your own key for public apps

Use when an app has no login, or only anonymous sign in, and still offers AI. The visitor pays for tokens and the deployment holds no provider key.

```ts
"use node";
import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import OpenAI from "openai";
import { rateLimiter } from "./limits";

export const completeWithOwnKey = action({
  args: { apiKey: v.string(), prompt: v.string() },
  returns: v.object({ text: v.string() }),
  handler: async (ctx, args) => {
    const key = args.apiKey.trim();
    if (!key.startsWith("sk-") || key.length < 20 || key.length > 300) {
      throw new ConvexError({ code: "INVALID_KEY" });
    }
    if (args.prompt.length > 4000) throw new ConvexError({ code: "TOO_LONG" });
    // Visitor pays tokens, the owner still pays action time
    const { ip } = await ctx.meta.getRequestMetadata();
    await rateLimiter.limit(ctx, "byokPerIp", { key: ip ?? "unknown", throws: true });
    // Call the provider here, inside this action. Never schedule with the key
    const res = await new OpenAI({ apiKey: key }).chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      messages: [{ role: "user", content: args.prompt }],
    });
    return { text: res.choices[0]?.message?.content ?? "" };
  },
});
```

Rules:

- Call the provider inside the action that received the key. Scheduled function args persist in `_scheduled_functions`.
- Never store, log, return, or echo the key in an error.
- The client keeps the key in `sessionStorage` by default, `localStorage` only when the visitor opts in.
- Server owns model allowlist, system prompt, and `max_tokens`.
- Remove the server key afterward: `npx convex env remove OPENAI_API_KEY --deployment <prod-name>`.
- Name the arg `apiKey` so the scanner recognizes the pattern.
- Templates ship an `AI_MODE` switch: unset means BYOK, `gateway` means Convex AI Gateway for signed in users only (pattern 4). Never offer a server provider key as a third mode.

## 13. Convex lint plugin

The deterministic version of the ledger's access check. Agents that run the linter see the error and fix it before you review.

```bash
npm i @convex-dev/eslint-plugin --save-dev
```

```js
// eslint.config.js (ESLint 9 flat config)
import { defineConfig } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  ...convexPlugin.configs.recommended,
  {
    files: ["**/convex/**/*.ts"],
    rules: {
      // Every public function must call a helper named require*, assert*, check*, ensure*, can*, or has*
      "@convex-dev/require-access-control": "error",
      // Public queries read bounded pages
      "@convex-dev/no-collect-in-query": "error",
      // "use node" files stay out of the default runtime
      "@convex-dev/import-wrong-runtime": "error",
    },
  },
]);
```

Notes:

- Recommended rules already include `require-args-validator`, `explicit-table-ids`, and `no-filter-in-query`. Fix old `ctx.db.get(id)` calls with `npx @convex-dev/codemod@latest explicit-ids`.
- Name access helpers to match (`requireUser`, `requireAdmin`, `assertOwner`), or pass `{ pattern: "^(require|authorize)" }` for your own prefixes. Call them as a top level statement in the handler. A check nested in an `if` body or `try` block is not detected.
- The rule skips HTTP actions and custom builders like `authedQuery`. Those are covered by `surface.cjs`.
- Oxlint runs every rule too. Biome cannot load ESLint plugins, so run Oxlint or ESLint next to it.
- Add `"lint": "eslint convex"` to `package.json` and run it in CI before deploy.

## 14. Agent tools and untrusted context

Tools run with the model's args, and the model reads text other people wrote. Check ownership inside the tool, against the user who started the run.

```ts
// convex/agents/tools.ts
import { createTool } from "@convex-dev/agent";
import { z } from "zod/v4";
import { internal } from "../_generated/api";

export const shareNote = createTool({
  description: "Share one of the user's notes by email",
  inputSchema: z.object({
    noteId: z.string(),
    to: z.string().email(),
  }),
  // A human confirms every send, with the exact recipient shown
  needsApproval: () => true,
  execute: async (ctx, input) => {
    if (!ctx.userId) throw new Error("No user on this run");
    // Ownership is checked against the run's user, never a userId from the model
    const note = await ctx.runQuery(internal.notes.getOwned, {
      userId: ctx.userId,
      noteId: input.noteId,
    });
    if (!note) return "Note not found";
    await ctx.runMutation(internal.email.queueShare, { noteId: note._id, to: input.to });
    return `Queued share to ${input.to}`;
  },
});
```

```ts
// convex/chat/approval.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getThreadMetadata } from "@convex-dev/agent";
import { components } from "../_generated/api";
import { approvalAgent } from "../agents/approval";
import { requireUser } from "../access";

export const submitApproval = mutation({
  args: {
    threadId: v.string(),
    approvalId: v.string(),
    approved: v.boolean(),
  },
  returns: v.object({ messageId: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Only the thread owner can approve its tool calls
    const thread = await getThreadMetadata(ctx, components.agent, { threadId: args.threadId });
    if (thread.userId !== user._id) throw new Error("NOT_FOUND");
    const { messageId } = args.approved
      ? await approvalAgent.approveToolCall(ctx, { threadId: args.threadId, approvalId: args.approvalId })
      : await approvalAgent.denyToolCall(ctx, { threadId: args.threadId, approvalId: args.approvalId });
    return { messageId };
  },
});
```

Rules:

- Create threads with `userId` from `ctx.auth`, then check thread ownership in every public function that takes a `threadId`.
- Retrieved text (RAG chunks, emails, web pages, memory) goes into the prompt inside clear delimiters, labeled as data. It never picks the tool, the owner, or the recipient.
- Cap steps per run (`stopWhen: stepCountIs(n)` in AI SDK 5, `maxSteps` in older versions) and rate limit per user (Agent rate limiting docs).
- Side effect tools write an audit row with the actor, the tool, and the args.

## 15. Bounded reads and fan out

```ts
// convex/posts.ts
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

// sec-check: public
export const listPublic = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    // Pages, not .collect(), so one call cannot read the whole table
    return await ctx.db
      .query("posts")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 50) });
  },
});
```

Rules:

- Clamp `numItems` on the server. The client picks the cursor, not the page size ceiling.
- A mutation that schedules work caps the count per call (for example 100 recipients) and rate limits per user. Bigger jobs go through a workpool or a batch internal action.
- Set usage limits on prod in the dashboard: Settings, Usage limits. Start with a warning threshold. A disable threshold stops the whole deployment, so set it well above normal traffic.
- Add a team spending limit in team billing settings as the second cap.

## 16. Storage URLs and delete cascades

```ts
// convex/files.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./access";

export const getAttachmentUrl = query({
  args: { attachmentId: v.id("attachments") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get("attachments", args.attachmentId);
    // Same answer for missing and not owned
    if (!doc || doc.ownerId !== user._id) return null;
    // The URL works for anyone who has it, so hand it only to the owner
    return await ctx.storage.getUrl(doc.storageId);
  },
});
```

```ts
// convex/users.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const deleteUserData = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Every table that holds this user's id, plus their files
    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.userId))
      .take(200);
    for (const a of attachments) {
      await ctx.storage.delete(a.storageId);
      await ctx.db.delete("attachments", a._id);
    }
    // Repeat per table (comments, embeddings, apiKeys, sessions), then reschedule while rows remain
    return null;
  },
});
```

Rules:

- Store the `storageId`, not the URL. Generate the URL per request after the access check.
- Vector search returns ids. Load each doc and apply the same owner or visibility check before returning it. Add the owner as a `filterFields` entry so the search itself is scoped.
- Deletes run in batches and reschedule until every table is empty for that id.

## 17. CI deploy keys and pull requests

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
permissions:
  contents: read              # the token can read code, nothing else
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # protected environment holds CONVEX_DEPLOY_KEY
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npx convex deploy --cmd "npm run build"
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
```

Rules:

- Pull request jobs use `on: pull_request`, which gets no secrets from forks. Never pair `pull_request_target` with a checkout of the PR head.
- Production deploy keys live in a protected environment limited to `main`. Preview builds use a preview deploy key.
- Pin third party actions to a tag you trust or a commit SHA. `npm ci` with a committed lockfile, never `npm install` in CI.
- Set `permissions: contents: read` at the top of every workflow and `persist-credentials: false` on checkout, so a compromised step cannot push.

A PR check that needs no secrets, so it is safe on forks:

```yaml
# .github/workflows/sec-check.yml
on: pull_request
permissions:
  contents: read
jobs:
  sec-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      # bash install.sh --project . ships the skill in .agents/skills
      - run: node .agents/skills/sec-check/scripts/surface.cjs . --diff origin/${{ github.base_ref }} --strict
      - run: bash .agents/skills/sec-check/scripts/sec-scan.sh . --no-history --strict
```

`--strict` fails the PR on an open row or a HIGH. Start report only (drop `--strict`) on an old repo, fix the backlog, then turn it on.

## 18. SECURITY.md for a Convex app

Put this at the repo root. The skill reads it before judging anything, so public by design surfaces stop showing up as findings and real invariants get checked. Keep it short and true. Never put secrets or exploit steps in it.

```markdown
# Security policy

## Reporting
Email security@example.com, or open a private advisory on GitHub. Please do not open a public issue.

## System and scope
What the app does, where it runs (Convex deployment, Vercel or Netlify frontend), and which parts are in scope.

## Who can do what
| Actor | Starts with | Must never get |
| --- | --- | --- |
| Signed out visitor | Public pages, `sec-check: public` functions | Any write except the rate limited ones listed below, any private row |
| Signed in user | Their own rows | Other users' rows, admin functions, the owner's provider keys |
| Admin | Role from the users table | Nothing beyond the app. Deploy keys stay in the host dashboard |
| Webhook sender | A signed request | Any write before the signature checks |

## Public by design
- `posts:listPublic` returns published posts with a projection.
- `waitlist:join` is anonymous, rate limited per IP.

## Invariants
- Identity comes from `ctx.auth`, never from args.
- Every paid call runs behind auth or an IP limit plus a global ceiling.
- Storage URLs go only to callers who passed the row's access check.

## Out of scope and accepted risk
Owner confirmed only, with the reason and a date. Example: "2026-10-21: like counts can be inflated by signed in users. Low value, revisit if likes affect ranking."
```

Rules:

- A component with its own boundary (an admin app, a CLI) can have its own `SECURITY.md` next to its code. The closest one wins.
- Accepted risks need a reason that can go stale. When the code changes, the skill rechecks the reason.
- Keep reporting instructions if the repo already has `.github/SECURITY.md`.

## 19. An authz regression test

A fix is proven when a second user fails. Write the test once and it guards the boundary on every future change. Uses `convex-test` and Vitest, in memory, no deployment.

The function under test checks the parent too, not only the caller (rule 3):

```ts
// convex/tasks.ts
export const create = authedMutation({
  args: { projectId: v.id("projects"), title: v.string() },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    // The caller must own the project the task goes into
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== ctx.user._id) {
      throw new ConvexError({ code: "NOT_FOUND" });
    }
    return await ctx.db.insert("tasks", {
      projectId: args.projectId,
      userId: ctx.user._id,
      title: args.title,
    });
  },
});
```

```ts
// convex/tasks.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("another user cannot write into my project", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice", tokenIdentifier: "test|alice" });
  const bob = t.withIdentity({ subject: "bob", tokenIdentifier: "test|bob" });

  // Seed both users and Alice's project directly
  const projectId = await t.run(async (ctx) => {
    const aliceId = await ctx.db.insert("users", { tokenIdentifier: "test|alice", name: "Alice" });
    await ctx.db.insert("users", { tokenIdentifier: "test|bob", name: "Bob" });
    return await ctx.db.insert("projects", { userId: aliceId, name: "Private" });
  });

  await expect(alice.mutation(api.tasks.create, { projectId, title: "ok" })).resolves.toBeDefined();
  await expect(bob.mutation(api.tasks.create, { projectId, title: "nope" })).rejects.toThrow();
  await expect(t.mutation(api.tasks.create, { projectId, title: "anon" })).rejects.toThrow();
});
```

Rules:

- Test three callers for each fixed function: the owner (works), another signed in user (throws), and nobody (throws).
- `tokenIdentifier` in `withIdentity` must match the seeded users row, or every call fails for the wrong reason and the test proves nothing.
- Add `"test": "vitest run"` and run it next to `npx tsc --noEmit` in CI. Install: `npm install -D convex-test vitest @edge-runtime/vm`, and set `environment: "edge-runtime"` in `vitest.config.ts`.
