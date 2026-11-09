---
name: create-prd
description: "Writes a short PRD in prds/<slug>.md before non trivial work: problem, root cause for bugs, proposed solution, files to change, edge cases, verification steps, and a completion log, with UTC metadata. Then queues the work in task.md. Use before any multi file feature, schema change, architectural decision, or bug that took real investigation, or when the user says write a PRD, @create-prd, or plan this."
---

# Create a PRD

A PRD is the scope contract for one change. Write it before the code, keep it under two screens, and update it when the plan changes.

Activate with `@create-prd`, `/create-prd`, or "write a PRD".

## When to write one

- Three or more files will change
- The schema changes
- An architectural choice is being made (auth, hosting, data model)
- A bug took real investigation to diagnose
- The work will be referenced later as a migration guide or how-to

## When to skip it

- A single file fix that is obvious from logs or types
- A typo, a CSS tweak, or a label change
- A copy change to markdown content

## Location and naming

- Every PRD lives in `prds/`.
- File name: `prds/<feature-or-problem-slug>.md`, kebab case. Example: `prds/adding-email-auth.md`.
- Always `.md`, never `.prd`.
- Finished or sensitive PRDs move to `prds/archive/`.

## Template

Copy the full template from [references/prd-template.md](references/prd-template.md). The required parts:

```markdown
# <Feature or problem, sentence case>

Created: YYYY-MM-DD HH:mm UTC
Last Updated: YYYY-MM-DD HH:mm UTC
Status: Draft | In Progress | Done

## Problem
## Root cause            (bugs only)
## Proposed solution
## Files to change
## Edge cases
## Verification steps
## Out of scope
## Task completion log
```

Get the time from the system (`date -u +"%Y-%m-%d %H:%M UTC"`). Never invent it.

## Filling it in

- Problem before solution. If the problem section is thin, the solution is a guess.
- For bugs, name the root cause: the line, query, or design choice. If it is unknown, say so and list the two likeliest candidates.
- Files to change is the scope. If a file not on the list needs to change, update the PRD first.
- Edge cases save the next session. Write down anything non obvious you found.
- Each verification step has an expected result, so someone else could run it.
- Out of scope is where extra ideas wait. Link an issue or a new PRD if they should happen later.
- The completion log is append only.

## After writing it

1. Add the tasks to `task.md` under `## To Do` as checkable items, with the PRD path.
2. Share the PRD with the user if it has a real choice in it. Wait for an answer on that choice.
3. Start building only once the plan is clear. Update `Last Updated` and `Status` as it moves.

## Never

- Write a PRD for a one line change.
- Pad it. Two screens is plenty for most work.
- Mark it Done before its verification steps ran.
