# builder-skills 3.0: workflow, security, and writing skills

Created: 2026-11-09 07:05 UTC
Last Updated: 2026-11-09 07:40 UTC
Status: In Progress (code done and verified locally; publish and GitHub triage pending owner)

## Problem

Convex ships about 40 official skills (`convex/agent-skills`), plugins for Claude Code, Codex, and Cursor (`convex/convex-agent-plugins`), and a setup page at https://www.convex.dev/agent-setup.md. The 13 `convex-*` skills here duplicated that work, and `convex` collided by name with the official skill. Issue #11: ten unquoted descriptions failed strict YAML, so `npx skills add` found 7 of 17 skills. `@waynesutton/builder-skills` was never published, and `@waynesutton/convex-skills` 1.0.9 was live and not deprecated. About 36K of the 37.7K skills.sh installs are the Convex skills.

## Root cause

- #11: `scripts/check-skills.mjs` split frontmatter lines on the first colon, so values strict YAML rejects passed the lint.
- Overlap: the repo predates the official Convex skills.

## Proposed solution

- Retire the Convex skills. Delete `convex`. Keep 12 stubs at the same paths for one release, because the skills.sh lock records `skillPath` plus a hash and `npx skills update` fetches that path.
- Ship 10 active skills: `workflow`, `create-prd`, and `update-project-docs` (the owner's project versions, merged with the stronger rules from `project-workflow` and `project-docs`), plus `git-safety`, `avoid-feature-creep`, `what-i-need-from-you`, `think-first` (renamed from `help`, which clashes with Claude Code's `/help`), `dev`, `sec-check`, and `write`.
- `skills/manifest.json` is the single list, read by the CLI, `index.js`, and the lint.
- CLI: a picker when run with no args in a TTY (modelled on `npx ui-skills`), plus `add`, `list --json`, `update`, `start`, and `init`. Zero dependencies. An unscoped `builder-skills` alias package.
- Lint: strict YAML scalar rules, plus cross-checks of every list against the manifest.

## Files to change

- `skills/*`: new skills, stubs, renames via `git mv`, `manifest.json`
- `bin/cli.js`, `index.js`, `scripts/check-skills.mjs`
- `package.json`, `.claude-plugin/*.json`, `skills.sh.json`, `.codex/skills/*`
- `packages/builder-skills/`, `scripts/legacy-package/`
- `templates/AGENTS.md`, `templates/files.md`, `templates/task.md`, new `templates/SECURITY.md` and `templates/prds/what-i-need-from-you.md`; `templates/skills/` removed
- `README.md`, `MIGRATING.md`, `AGENTS.md`, `GEMINI.md`, `CONTRIBUTING.md`, `docs.md`, `.codex/README.md`, `changelog.md`, `files.md`, `task.md`, `prds/lessons.md`, `prds/github-triage.md`
- `command/convex.md` removed

## Edge cases

- Stubs must not compete with official skills during normal Convex work, so their descriptions only trigger on the old name.
- `metadata.internal` would hide stubs from installers, but it would also hide them from `skills update`, and an extra frontmatter key breaks Pi (#7). Stubs stay visible and say "Retired".
- `update` must not overwrite an edited `dev`, so it skips `dev` unless the skill is named or `--force` is passed.
- npm skips symlinks, so `CLAUDE.md` was dropped from `files`.
- npm may refuse the unscoped `builder-skills` name as too similar to another package. The fallback is the scoped name only.
- `--link` from an npx run points into the npx cache. The help text says to use it from a clone.

## Verification steps

1. `npm run check`: 0 errors, 0 warnings. Done.
2. `npx skills add <working tree copy> --list`: 22 skills, 0 skipped. Done.
3. Picker through a pty with `.cursor` present: Cursor is the default, the picks install, starters are added. Done.
4. `add --all --target claude,codex`: 10 folders each, `sec-check/scripts/` present. Done.
5. `add convex-functions project-docs`: replacements printed, exit 1. Done.
6. `update`: refreshes skills, skips an edited `dev`, lists retired folders. Done.
7. `init` twice: the second run skips every file. Done.
8. Pack both tarballs, install them in a temp project, `npx builder-skills -v` and `add`: works. Done.
9. sec-check scripts run on a sample repo, and the diff against the source shows only the name changes. Done.
10. After the push: `npx skills update` on an old `convex-functions` install receives the stub. Pending.

## Out of scope

- Deleting the stubs (4.0).
- Hosting a skills catalog site or MCP like ui-skills.com.

## Task completion log

- 2026-11-09 07:05 UTC PR #12 merged by owner, `main` at `ab7dcf3`.
- 2026-11-09 07:20 UTC Skills, manifest, CLI, lint, and templates done. sec-check and write built in parallel.
- 2026-11-09 07:40 UTC Docs synced, all local verification steps pass. Waiting on owner for commit, publish, and triage approval.
