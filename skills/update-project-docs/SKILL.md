---
name: update-project-docs
description: "Brings task.md, changelog.md, and files.md back in sync with what the code says shipped, then prints a commit message as plain text. Reads git history and the working tree, never memory, and refuses to log features it cannot see in source. Use when a feature or fix lands, when the user says /update, @update, update project docs, sync changelog, or update files.md, or when task.md and the code disagree."
---

# Update project docs

Activate with `/update`, `@update`, `update project docs`, or `sync project docs`.

Three files describe a project to the next person who opens it. Keep them true.

| File | Answers |
| --- | --- |
| `task.md` | What is planned, in flight, and done |
| `changelog.md` | What changed for users, by version and date |
| `files.md` | What each file is for |

Truth comes from the repo, not from the conversation. If the diff does not show it, it did not ship.

## Run the sync

1. Find the root. `git rev-parse --show-toplevel`, or the workspace root without git.
2. Collect evidence. `git log --date=short -n 20`, `git status --short`, `git diff --stat`, and for the current change `git diff HEAD --stat` or the staged diff. See [references/evidence-rules.md](references/evidence-rules.md) for what counts.
3. Read all three files as they are. Note the last logged date and the last completed task.
4. Update each file. Rules below.
5. Check idempotency. If nothing new landed since the last entry, change nothing and say so.
6. Scan for secrets and personal data before saving. See the redaction section.
7. Print the commit message. Rules below.
8. Report in a few lines. Show the new changelog entry or say the docs were already current.

## task.md

Sections: `## To Do`, `## In Progress`, `## Completed`.

- Move an item to Completed only if its verification step ran. If the PRD lists a check that has not run, leave it In Progress and say which check is pending.
- Completed entries: `- [x] YYYY-MM-DD HH:mm UTC <what>. <PRD path if any>. <files touched>. Verified: <command or outcome>.`
- Never delete history. Old completed items stay.
- If `task.md` does not exist, create it with the three headings and the current change under Completed or In Progress based on the evidence.

## changelog.md

Keep a Changelog format. `## [Unreleased]` at the top, then `## [x.y.z] - YYYY-MM-DD` blocks, each with `### Added`, `### Changed`, `### Fixed`, `### Removed` as needed.

- Dates come from `git log --date=short`. The release date is the date of the commit that bumped the version, or today's UTC date if it has not been committed yet. Never a placeholder, never a future month.
- Write for the user of the project, not the author. "Uploads over 5 MB now show a progress bar" beats "refactored upload hook".
- One line per change. Group related commits.
- Do not log dependency bumps, formatting, or generated files unless they change behavior.
- If a version bump exists in `package.json` with no matching heading, add the heading.

## files.md

One line per file that matters. Grouped by folder.

```
## convex/
- `schema.ts` tables and indexes
- `stats.ts` heartbeat mutation with 10s dedup window, page view inserts

## src/hooks/
- `usePageTracking.ts` sends heartbeats, debounced 5s, path change aware
```

- Add every new source file from the diff.
- Fix descriptions that the diff made wrong.
- Skip `node_modules`, `_generated`, lockfiles, build output, and assets unless they are hand written.
- Keep each description under one line. What it is for, not how it works.

## Convex projects

When the repo has a `convex/` folder, the changelog and files.md can name Convex features, but only ones the source proves. [references/convex-detection.md](references/convex-detection.md) lists what file shows what.

Short version:

- A component counts only if `convex/convex.config.ts` registers it. A dependency in `package.json` is not proof.
- Crons count only if `convex/crons.ts` exists and registers a job.
- HTTP actions count only if `convex/http.ts` has a route.
- Auth counts only if `convex/auth.config.ts` or an auth component is present.
- AI model names count only if code or config names them. Do not guess which model built the app.

Prefer `none` over an invented value.

## Redaction

`changelog.md` and `files.md` are often public. Treat them that way.

- Never open `.env`, `.env.local`, or any secret store to fill in a doc. Env var names are fine to mention. Values never.
- Never include API keys, tokens, email addresses, phone numbers, street addresses, private hostnames, or application data records.
- Scan the whole file before saving, not just the new lines. Replace any address shaped text with `[redacted]` and say so in one line.
- Log behavior, not identifiers. "Signed webhook verification for inbound mail" is fine. The inbox address is not.

## Boundaries

- Edit only `task.md`, `changelog.md`, `files.md`, and PRDs the user points at. Nothing else unless asked.
- Never commit, push, deploy, publish, or tag. Print the suggested commit message instead.
- Never rewrite older entries for tone. Fix facts when the evidence contradicts them and flag the correction.
- Do not call production APIs or query live data to make the docs richer.

## Commit message

After syncing, print the commit message as plain text in a code block. No `git add`, no `git commit`, no heredoc, no shell at all.

```
<type>: <short summary of the main change>

- optional bullet when the change touches more than two concerns
```

- Type is one of `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
- Present tense, subject under 50 characters, no period at the end.
- A docs only sync uses `docs: sync task, changelog, and files`.

## Report format

```
Synced project docs.

changelog.md  added 2.1.0 (2026-09-15): 3 added, 1 fixed
files.md      added 2 files, updated 1 description
task.md       moved 1 item to Completed, 1 still In Progress (verification pending: e2e)

Suggested commit: docs: sync changelog, files, and tasks for 2.1.0
```
