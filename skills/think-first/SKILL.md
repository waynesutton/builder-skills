---
name: think-first
description: "Reflection first problem solving for Convex projects: root cause before code, two candidate fixes, a 98 percent confidence bar, and changes limited to the files the request needs. Use before implementing any fix or feature, when a bug report comes in, when a previous fix did not work, or when the request is vague."
---

# Think first

Slow down for thirty seconds before the first edit. It saves an hour later.

## 1. Reflect before acting

1. **Reflect.** Why does the current code not do what the user wants? Read it. Do not guess.
2. **Identify.** What is missing, wrong, or incomplete relative to the request?
3. **Theorize.** List two or three possible sources of the problem or areas that need to change.
4. **Distill.** Narrow to the one or two most likely causes and say why.
5. **Proceed.** Move forward only once that is clear.

Never assume. If anything is unclear, ask one focused question and stop. A wrong assumption costs more than a question.

## 2. Confidence bar

Do not write code below 98 percent confidence in what needs to change. Below that: read more, ask, or propose a plan instead of a diff. Edit the number if this project wants a different bar.

## 3. Convex rules

Check https://docs.convex.dev/llms.txt for the current API before relying on memory.

- Call mutations with plain objects. Write a dedicated mutation that maps form fields to document fields, and keep the names the same where you can.
- Patch directly when you do not need the current document.
- Check ownership on the server. Load the document and compare its owner to the caller from `ctx.auth`, or read through an index on the owner field. Never trust an owner id passed in args.
- Make mutations idempotent with early returns when the document is already in the target state.
- Order new items by a timestamp field or `_creationTime`.
- Use `Promise.all` for independent reads. It does not prevent write conflicts. To avoid OCC conflicts, keep each mutation's reads and writes narrow and avoid many writers on one hot document.

Docs to check:

- Functions: https://docs.convex.dev/functions
- Mutations: https://docs.convex.dev/functions/mutation-functions
- Queries: https://docs.convex.dev/functions/query-functions
- Validation: https://docs.convex.dev/functions/validation
- Schemas: https://docs.convex.dev/database/schemas
- Zen of Convex: https://docs.convex.dev/understanding/zen
- Best practices: https://docs.convex.dev/understanding/best-practices/
- TypeScript: https://docs.convex.dev/understanding/best-practices/typescript

Authentication:

- Convex Auth: https://docs.convex.dev/auth/convex-auth (beta; the setup guide is at https://labs.convex.dev/auth)
- Auth in functions: https://docs.convex.dev/auth/functions-auth
- Other providers: https://docs.convex.dev/auth

For Convex work beyond these rules, use the official Convex skills. https://www.convex.dev/agent-setup.md installs them.

## 4. Scope

Change:

- Only the files the request needs.
- The schema, if the request needs it.
- `changelog.md`, `files.md`, and `task.md` after the change lands. Run `git log --date=short` so dates match the real history. No placeholders, no future months.

Do not change:

- UI, layout, design, colors, or copy the request did not mention.
- Admin dashboard sections, frontend components, or features the request did not mention. Nothing gets removed without being asked.
- [Add project specific protected areas here.]

## 5. UI

- Use the site's design system for every popup, alert, modal, warning, toast, and confirmation. Never the browser default.
- Follow the Vercel Web Interface Guidelines: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/refs/heads/main/AGENTS.md

## 6. Docs policy

Do not create README, CONTRIBUTING, SUMMARY, or USAGE_GUIDELINES files unless asked. A short summary in the reply is enough. No emojis in docs or the app unless asked.

## 7. Git

Load `git-safety` before any git command that could discard work. Short version: `git status` first, `git diff` before discarding, undo by editing files, and never run `reset --hard`, `checkout -- .`, `clean -fd`, or `stash drop` without the user approving that exact command.

## Checklist

Before the first edit:

- [ ] I can name the root cause
- [ ] I considered at least two fixes and picked one for a reason
- [ ] I am at or above the confidence bar
- [ ] I know which files change and which do not
- [ ] I am keeping UI and features the request did not mention
- [ ] I checked the relevant docs
- [ ] Anything unclear has been asked

Before saying done:

- [ ] The fix was verified, not just written
- [ ] Nothing outside the request changed
- [ ] Docs synced if the change was non trivial
