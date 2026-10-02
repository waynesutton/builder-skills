---
name: convex
description: "Routes Convex work to the right builder skill and covers the handful of rules that apply everywhere: validators on every function, withIndex over filter, idempotent mutations, internal functions for scheduling. Use when a task mentions Convex and no more specific skill matches, or as the first stop before picking one."
---

# Convex

Start here, pick the matching skill below, and load it. If nothing matches, the rules at the bottom still apply.

## Pick a skill

| Skill | Load when |
| --- | --- |
| convex-best-practices | general patterns, project structure, "is this the Convex way" |
| convex-functions | queries, mutations, actions, internal functions, error handling |
| convex-schema-validator | tables, indexes, validators, `v.*` types, schema changes |
| convex-realtime | useQuery, optimistic updates, pagination, presence, rerender churn |
| convex-http-actions | webhooks, REST endpoints, `convex/http.ts`, Stripe or Clerk callbacks |
| convex-file-storage | uploads, upload URLs, serving files, storage cleanup |
| convex-cron-jobs | crons.ts, runAfter, runAt, batching, a cron that is not firing |
| convex-migrations | backfills, renaming fields, schema evolution with live data |
| convex-agents | AI agents, threads, tools, streaming, RAG with `@convex-dev/agent` |
| convex-component-authoring | building a reusable component package, `defineComponent` |
| convex-security-check | fast pre ship audit: auth on public functions, exposed data |
| convex-security-audit | deep review: authorization model, injection, rate limits, secrets |
| avoid-feature-creep | scope pushback, MVP cuts, "just one more feature" |
| project-workflow | multi step tasks, PRDs in prds/, task.md, plans for review |
| project-docs | syncing task.md, changelog.md, files.md with shipped code |
| git-safety | revert, undo, reset, checkout, clean, stash, force push |

Two skills often apply at once. Load the domain skill for the code and the process skill for the workflow, for example convex-functions plus project-workflow.

## Rules that hold everywhere

- Every function declares `args` and `returns` validators, including internal ones.
- Read through `withIndex`. `.filter()` on a table scan is a bug waiting for data.
- Mutations are idempotent. Check current state, return early when there is nothing to do.
- Schedule and cron only `internal.*` functions. Never `api.*`.
- Never call `Date.now()` inside a query. Pass time in as an argument.
- Use `npx convex dev` for development. Do not run `npx convex deploy` unless asked.
- Fetch https://docs.convex.dev/llms.txt before trusting memory about an API.

## Do not

- Edit anything under `convex/_generated/`.
- Use `crons.daily`, `crons.hourly`, or `crons.weekly`. Use `crons.interval` or `crons.cron`.
- Put `"use node"` in a file that also exports queries or mutations.
- Run git commands that discard work without loading git-safety first.

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/understanding/best-practices
- https://docs.convex.dev/functions
