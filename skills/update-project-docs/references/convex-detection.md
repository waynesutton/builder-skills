# Convex feature detection

Which file proves which Convex feature. Use this before naming a feature in `changelog.md` or `files.md`. If the file is not there, the feature did not ship.

## Core

| Feature | Proof | Not proof |
| --- | --- | --- |
| Convex backend | `convex/` folder with `schema.ts` or any function file | `convex` in `package.json` alone |
| Schema and indexes | `convex/schema.ts` with `defineTable` and `.index(...)` | a types file |
| Queries, mutations, actions | `query({`, `mutation({`, `action({` in `convex/*.ts` | frontend hooks alone |
| Internal functions | `internalQuery`, `internalMutation`, `internalAction` | |
| Pagination | `.paginate(` or `paginationOptsValidator` | |
| Full text search | `.searchIndex(` in schema and `.withSearchIndex(` in a query | |
| Vector search | `.vectorIndex(` in schema and `ctx.vectorSearch(` in an action | an embeddings dependency |

## Platform features

| Feature | Proof |
| --- | --- |
| HTTP actions and webhooks | `convex/http.ts` with `http.route({` |
| Cron jobs | `convex/crons.ts` with `crons.interval(` or `crons.cron(` |
| Scheduled functions | `ctx.scheduler.runAfter(` or `runAt(` |
| File storage | `ctx.storage.generateUploadUrl(` or `ctx.storage.getUrl(` or `v.id("_storage")` |
| Auth | `convex/auth.config.ts`, or `ctx.auth.getUserIdentity(` in functions |
| Convex Auth | `@convex-dev/auth` registered in `convex/auth.ts` |
| Clerk | `convex/auth.config.ts` with a Clerk domain, `ClerkProvider` in the frontend |
| WorkOS AuthKit | `convex/auth.config.ts` with a WorkOS issuer, `AuthKitProvider` in the frontend |
| Environment variables | `process.env.X` in `convex/`. Log the name `X`, never the value |

## Components

A component counts only when `convex/convex.config.ts` calls `app.use(...)` with it.

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import migrations from "@convex-dev/migrations/convex.config";

const app = defineApp();
app.use(agent);
app.use(migrations);
export default app;
```

The example above proves `agent` and `migrations`. It proves nothing about any other `@convex-dev/*` package in `package.json`.

Common components and their config imports:

| Component | Import in convex.config.ts |
| --- | --- |
| Agent | `@convex-dev/agent/convex.config` |
| Workflow | `@convex-dev/workflow/convex.config` |
| Migrations | `@convex-dev/migrations/convex.config` |
| Rate limiter | `@convex-dev/rate-limiter/convex.config` |
| Aggregate | `@convex-dev/aggregate/convex.config` |
| Sharded counter | `@convex-dev/sharded-counter/convex.config` |
| Presence | `@convex-dev/presence/convex.config` |
| Resend | `@convex-dev/resend/convex.config` |
| R2 | `@convex-dev/r2/convex.config` |
| Polar | `@convex-dev/polar/convex.config` |
| Static hosting | `@convex-dev/static-hosting/convex.config` |

## AI

| Claim | Proof |
| --- | --- |
| Uses an LLM | an SDK call in `convex/` such as `openai.chat.completions.create(` or `generateText(` |
| Specific model | a literal model string in code or config, e.g. `model: "gpt-4o"` |
| Which model built the app | never derivable from code. Only log if the user states it. |

## Deployment

| Claim | Proof |
| --- | --- |
| Deployed to Convex cloud | `CONVEX_DEPLOYMENT` name in a checked in config, or a public `.convex.cloud` URL in source or docs |
| Frontend host | `vercel.json`, `netlify.toml`, `wrangler.toml`, or a static hosting component registered |
| Live URL | present in README or config. Otherwise write `not deployed` |

Do not read `.env.local` to find a deployment name. Ask once if the user needs it for a public doc and it cannot be detected.
