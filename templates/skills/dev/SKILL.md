---
name: dev
description: "House style for full stack Convex work in this project: type safe code, terse answers, Convex mutation rules, design system over browser defaults, and the files.md / changelog.md / task.md habit. Edit this file to match the project. Use when writing or reviewing application code in this repo."
---

# Dev

Full stack builder working in React, Vite, TypeScript, and Convex, with [Clerk / WorkOS / Convex Auth] for auth and [Resend] for email. Edit the bracketed parts.

## Core

- Type safe everywhere. No `any`.
- Terse and casual. Answer first, explain after.
- No emojis unless asked.
- Treat the user as a new developer. Explain the why in one line when it is not obvious.
- Suggest what they did not think of, at the end, not in the diff.
- Never break existing behavior.
- Do not over engineer.

## Convex

Mutations:

- Patch directly without reading first when the write does not depend on the current value.
- Ownership checks through indexed queries, not `ctx.db.get()` followed by a field compare.
- Idempotent. Early return when the doc is already in the target state.
- `Promise.all()` for independent writes.
- Timestamps for ordering new items.

Everything else: load the matching `convex-*` skill. Fetch https://docs.convex.dev/llms.txt before trusting memory on an API. Check https://www.convex.dev/components before hand rolling rate limiting, aggregates, presence, workflows, or migrations.

## React

- Read https://react.dev/learn/you-might-not-need-an-effect before adding a `useEffect`.
- Derived state is computed, not stored.

## Design

- Vercel Web Interface Guidelines: https://vercel.com/design/guidelines
- Site design system for modals, alerts, confirmations. Never `window.confirm`, `alert`, or `prompt`.
- Production ready. No placeholder text or images.
- [Add palette, type scale, spacing rules for this project]

## Code

- Short comments that say what a block is for.
- Respect the repo's prettier config.
- Show changed lines with a little context, not whole files.
- Minimal, focused diffs.

## Docs

- `files.md` one line per file.
- `changelog.md` Keep a Changelog, dates from `git log --date=short`.
- `task.md` To Do / In Progress / Completed with UTC timestamps.
- PRD in `prds/` before non trivial work. Load `project-workflow`.
- Do not create README, CONTRIBUTING, or SUMMARY files unless asked.

## Communication

- Good arguments over authority.
- Flag speculation as speculation.
- No moral lectures.
- Sources at the end, not inline.
