# builder-skills

Workflow, security, and writing skills for builders shipping Convex apps. This file is context for agents working inside this repo. `CLAUDE.md` symlinks to it.

## What this repo is

Ten active skills in `skills/<name>/`: six for running a project, two for how the agent codes, one security check, one writing guide. Twelve more folders are retired stubs that point to the official Convex skills. They ship for one release so `npx skills update` delivers the redirect, then go away in 4.0.

`skills/manifest.json` is the one list of skills, groups, and retired names. The CLI (`bin/cli.js`), `index.js`, and the lint (`scripts/check-skills.mjs`) all read it.

Convex API knowledge now lives in the official Convex skills (https://github.com/convex/agent-skills) and plugins (https://github.com/convex/convex-agent-plugins). Do not add Convex API skills here. Point to those instead.

## Docs first

For any Convex API a skill mentions, fetch https://docs.convex.dev/llms.txt and follow the link for the area. Do not rely on memory for method names, validator names, or component APIs.

## Working on skills

- Frontmatter is `name` and a quoted `description` only. `name` matches the folder. Unquoted values with `: ` break strict YAML parsers (issue #11), and the lint fails on them.
- `description` is third person, says what the skill does, and ends with a `Use when ...` sentence. Under 1024 characters.
- `SKILL.md` under 300 lines. Hard limit 500. Deep material goes in `references/*.md`, linked from `SKILL.md`. References do not link to each other.
- Scripts go in `scripts/` and are run with `bash` or `node`, so file modes do not matter.
- No emojis. No em dashes. No marketing words.
- Adding a skill:
  1. add a folder with `SKILL.md`, `agents/openai.yaml`, and `assets/`
  2. add an entry to `skills/manifest.json`
  3. add it to `.claude-plugin/plugin.json`, `skills.sh.json`, the README table, and `docs.md`
  4. run `ln -s ../../skills/<name> .codex/skills/<name>`
  5. run `npm run check`, which fails if any list disagrees with the manifest
- Retiring a skill: replace `SKILL.md` with a stub under 25 lines, delete its `references/`, and move its manifest entry to `retired` with `stub: true` and a replacement.

## Working on this repo

- Non trivial work gets a PRD in `prds/`. See `skills/create-prd`.
- After a change, sync `task.md`, `changelog.md`, and `files.md`. See `skills/update-project-docs`. Dates come from `git log --date=short`.
- Before any git command that could discard work, see `skills/git-safety`.
- Run `npm run check` before calling anything done. It has to pass.
- Do not commit, push, publish, tag, or deploy. Print a suggested commit message and stop.

## Layout

```
skills/manifest.json              groups, active skills, retired skills
skills/<name>/SKILL.md            the skill
skills/<name>/references/*.md     loaded on demand from SKILL.md
skills/<name>/scripts/            sec-check only: scanner, ledger, run log
skills/<name>/agents/openai.yaml  Codex icon metadata
bin/cli.js                        the CLI: picker, add, list, update, start, init
index.js                          programmatic API
packages/builder-skills/          unscoped npx alias, forwards to the main package
scripts/check-skills.mjs          lint, run with npm run check
scripts/legacy-package/       final release of the old npm name, prints the move
templates/                        starters copied by init
skills.sh.json                    how skills.sh groups this repo's skills
.claude-plugin/                   plugin.json and marketplace.json for Claude Code
.codex/skills/                    symlinks into skills/ for Codex discovery
prds/                             PRDs for this repo, lessons.md, archive/
```

## Skills

| Skill | Load when |
| --- | --- |
| `workflow` | multi step work: triage, PRD, task.md, docs sync |
| `create-prd` | before a multi file feature, schema change, or hard bug |
| `update-project-docs` | a change landed, or the user says `/update` |
| `git-safety` | any git command that could discard work |
| `avoid-feature-creep` | scope is drifting |
| `what-i-need-from-you` | ending a turn, or blocked on the user |
| `think-first` | a bug, a failed fix, a vague request |
| `dev` | writing app code in the house style |
| `sec-check` | before deploy, a public repo, or after AI generated code |
| `write` | READMEs, docs, posts, emails, commit messages |
