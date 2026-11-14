# Context for Gemini CLI

Short context for Gemini CLI in a Convex project that uses builder-skills.

## Convex setup

If `convex/_generated/ai/guidelines.md` is missing, read https://www.convex.dev/agent-setup.md and follow it. Read `guidelines.md` before writing Convex code.

## Docs first

Prefer retrieval over memory for Convex APIs. Fetch https://docs.convex.dev/llms.txt and follow the link for the area you are touching. Use the official Convex skills (https://github.com/convex/agent-skills) for Convex APIs.

## Rules

1. Validate `args` and `returns` on every function.
2. `withIndex` over `filter`.
3. Mutations are idempotent. Early return when nothing changes.
4. Schedule `internal.*` functions only.
5. Identity comes from `ctx.auth`, never from args.
6. Throw `ConvexError` for errors the client should see.

## Commands

```bash
npx convex dev        # development, watches and syncs
npx convex logs       # tail logs
npx convex dashboard  # open dashboard
```

Do not run `npx convex deploy` or any git command that changes history without an explicit instruction.

## Skills

builder-skills covers the work around Convex: `workflow`, `create-prd`, `update-project-docs`, `git-safety`, `avoid-feature-creep`, `what-i-need-from-you`, `think-first`, `dev`, `state-machines`, `sec-check`, and `write`. Run `npx builder-skills start` to see which one fits a task. Index: https://github.com/waynesutton/builder-skills
