---
name: workflow
description: "Runs multi step work the way a careful senior engineer would: triage before code, a PRD in prds/, task.md kept current, docs synced after, and lessons recorded when a mistake repeats. Hands PRD writing to create-prd and the docs sync to update-project-docs. Use when a task spans several files or steps, changes architecture, needs a plan the user can review, or when the user says plan this, track this in task.md, or what did we learn."
---

# Workflow

One loop for any task bigger than a typo. Triage, plan in a PRD, track in `task.md`, sync docs when done, and write down what went wrong so it does not repeat.

Skip this for one file fixes: a typo, a copy change, a single obvious bug. Just fix those.

## The loop

1. **Triage.** Read the request and the code before touching anything.
2. **PRD.** Load `create-prd` and write `prds/<slug>.md`. Share it when the plan has a real choice in it.
3. **Track.** Add the work to `task.md` under `## To Do`. Move items as they land.
4. **Build.** Small steps. Verify each one.
5. **Sync docs.** Load `update-project-docs` to update `task.md`, `changelog.md`, and `files.md`, then print the commit message.
6. **Learn.** If the user corrected the same thing twice, add a line to `prds/lessons.md`.

Related skills, load them when the step comes up:

| Step | Skill |
| --- | --- |
| Writing the PRD | `create-prd` |
| Syncing docs after a change | `update-project-docs` |
| Any git command that could discard work | `git-safety` |
| Scope starts to drift | `avoid-feature-creep` |
| Blocked on the user, or the next step needs them | `what-i-need-from-you` |
| Before a deploy or a public repo | `sec-check` |

## Triage

Before writing code, answer these in a few lines:

- What is missing, broken, or incomplete?
- What are two or three likely causes or approaches?
- Which one is most likely, and why?
- What is still unclear enough to ask about?

If the last answer is not empty, ask. One question, not five. Then wait.

For bugs, name the root cause before proposing the fix. A fix without a root cause is a guess.

## When a PRD is needed

Write one when any of these hold:

- three or more files will change
- the schema changes
- an architectural choice is being made (auth, hosting, data model)
- a bug took real investigation to diagnose
- the work will be referenced later as a guide

Skip it for a single file fix that is obvious from logs or types, a typo, a CSS tweak, or a copy change.

## Task tracking

`task.md` has three sections: `## To Do`, `## In Progress`, `## Completed`.

- New work goes under To Do with a link to its PRD.
- Keep one item In Progress at a time when possible.
- An item moves to Completed after verification, not after the edit.
- Completed entries carry a `YYYY-MM-DD HH:mm UTC` timestamp, the files touched, and the verification command or outcome.

Good entry:

```
- [x] 2026-09-15 18:40 UTC Fix duplicate heartbeat writes. prds/heartbeat-dedup.md. convex/stats.ts, src/hooks/usePageTracking.ts. Verified: npx convex dev clean, no OCC retries in dashboard for 10 min.
```

Bad entry:

```
- [x] fixed heartbeat
```

## Docs sync

After each feature or fix, `task.md`, `changelog.md`, and `files.md` have to agree with the code. `update-project-docs` has the rules. In short:

- `changelog.md` follows Keep a Changelog. Dates come from `git log --date=short`, never from memory.
- `files.md` gets new files added and stale descriptions fixed.
- Claims about what shipped come from the diff, not from the plan.

Trigger it with `/update`, `@update`, or "update project docs".

## Execution style

- Keep the change set tight. The request sets the scope. Extra ideas go in the summary, not the diff.
- Use one subagent per research question when the task is big enough to benefit. Do not run parallel edits on the same file.
- Stop and re plan if the work stops making sense. Update the PRD, then continue.
- Before calling it done, ask: would a staff engineer approve this diff as is?

## Learning loop

`prds/lessons.md` is a flat list. One line per lesson, newest at the bottom:

```
- 2026-09-15 Do not add returns validators that duplicate the schema doc shape; share a validator constant instead.
```

Add a lesson when:

- the user corrects the same pattern a second time
- a verification step catches something the plan missed
- a tool or API behaved differently from the docs

Read `prds/lessons.md` at the start of any session in that repo.

## Never

- Deploy, publish, commit, or push. The user does those.
- Mark a task done without running the verification step in the PRD.
- Invent a date. Run `git log` or use the current UTC time.
- Write a PRD for a one line change.
