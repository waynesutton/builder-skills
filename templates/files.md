# Files

One line per file that matters. What it is for, not how it works. Keep this in sync with the code; the `update-project-docs` skill does it from the git diff.

## Root

- `AGENTS.md` agent context: stack, commands, rules, workflow
- `CLAUDE.md` symlink to AGENTS.md
- `files.md` this file
- `changelog.md` user facing changes by version, Keep a Changelog format
- `task.md` To Do / In Progress / Completed with UTC timestamps
- `SECURITY.md` what is public by design, who can do what, accepted risks. Read by sec-check
- `package.json` scripts and dependencies

## convex/

- `schema.ts` tables, validators, indexes
- `convex.config.ts` components registered with app.use

## src/

- `main.tsx` app entry, Convex and auth providers

## prds/

- `lessons.md` one line per lesson learned, read at session start
- `what-i-need-from-you.md` open and done asks from the agent, by id
