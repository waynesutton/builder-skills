# Documentation index

Where everything in this repo is documented.

## Start here

| Document | Purpose |
| --- | --- |
| [README.md](README.md) | What this is, Convex setup, install, skills, starters, what moved |
| [MIGRATING.md](MIGRATING.md) | From the old npm package and the 2.x skills to 3.0, plus owner publish steps |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Skill rules, how to add a skill, `npm run check` |
| [LICENSE](LICENSE) | Apache-2.0 |

## Agent context

| Document | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Context for agents working in this repo. `CLAUDE.md` symlinks here. |
| [GEMINI.md](GEMINI.md) | Gemini CLI context for Convex projects |
| [.codex/README.md](.codex/README.md) | How Codex finds skills through `.codex/skills/` symlinks |

## Skills

Eleven active skills. Each is `skills/<name>/SKILL.md`. Some have `references/` loaded on demand. The list lives in [skills/manifest.json](skills/manifest.json).

| Skill | Group | Use when | References |
| --- | --- | --- | --- |
| [workflow](skills/workflow/SKILL.md) | Workflow | Multi step work | |
| [create-prd](skills/create-prd/SKILL.md) | Workflow | Before non trivial work | prd-template |
| [update-project-docs](skills/update-project-docs/SKILL.md) | Workflow | A change landed, `/update` | evidence-rules, convex-detection |
| [git-safety](skills/git-safety/SKILL.md) | Workflow | Git commands that could discard work | |
| [avoid-feature-creep](skills/avoid-feature-creep/SKILL.md) | Workflow | Scope is drifting | |
| [what-i-need-from-you](skills/what-i-need-from-you/SKILL.md) | Workflow | Ending a turn, blocked on the user | |
| [think-first](skills/think-first/SKILL.md) | Coding | A bug, a failed fix, a vague request | |
| [dev](skills/dev/SKILL.md) | Coding | App code in the house style | |
| [state-machines](skills/state-machines/SKILL.md) | Coding | Auditing status fields and flows | problems |
| [sec-check](skills/sec-check/SKILL.md) | Security | Before deploy or a public repo | rules, audit, patterns, probe (+ scripts) |
| [write](skills/write/SKILL.md) | Writing | Prose of any kind | formats, watchlist |

Twelve retired stubs (`convex-*`) point to the official Convex skills. The README's "Moved in 3.0" table has the map.

## Templates

Copied into a user's project by `builder-skills init`. Nothing is overwritten.

| Template | Lands at |
| --- | --- |
| [templates/AGENTS.md](templates/AGENTS.md) | `AGENTS.md`, with `CLAUDE.md` symlinked to it |
| [templates/files.md](templates/files.md) | `files.md` |
| [templates/changelog.md](templates/changelog.md) | `changelog.md` |
| [templates/task.md](templates/task.md) | `task.md` |
| [templates/SECURITY.md](templates/SECURITY.md) | `SECURITY.md` |
| [templates/prds/lessons.md](templates/prds/lessons.md) | `prds/lessons.md` |
| [templates/prds/what-i-need-from-you.md](templates/prds/what-i-need-from-you.md) | `prds/what-i-need-from-you.md` |

## Tooling

| File | Purpose |
| --- | --- |
| [bin/cli.js](bin/cli.js) | `builder-skills` CLI: picker, `add`, `list`, `show`, `update`, `start`, `init` |
| [index.js](index.js) | Programmatic API |
| [packages/builder-skills/](packages/builder-skills/README.md) | Unscoped `builder-skills` npm alias |
| [scripts/check-skills.mjs](scripts/check-skills.mjs) | Lint. `npm run check`. Runs before publish. |
| [scripts/legacy-package/](scripts/legacy-package/README.md) | Final release of the old npm name. Prints where things moved. |
| [skills.sh.json](skills.sh.json) | Groups on the skills.sh repo page |
| [.claude-plugin/plugin.json](.claude-plugin/plugin.json) | Claude Code plugin manifest |
| [.claude-plugin/marketplace.json](.claude-plugin/marketplace.json) | Marketplace manifest for `claude plugin marketplace add` |

## Project tracking

| Document | Purpose |
| --- | --- |
| [changelog.md](changelog.md) | Keep a Changelog, dates from git |
| [files.md](files.md) | One line per file |
| [task.md](task.md) | To Do / In Progress / Completed |
| [prds/](prds/) | One PRD per non trivial change. `lessons.md`. `archive/` for old ones. |

## External

| Resource | URL |
| --- | --- |
| Convex docs | https://docs.convex.dev/ |
| Convex llms.txt | https://docs.convex.dev/llms.txt |
| Convex agent setup | https://www.convex.dev/agent-setup.md |
| Official Convex skills | https://github.com/convex/agent-skills |
| Official Convex plugins | https://github.com/convex/convex-agent-plugins |
| Anthropic skill creator | https://github.com/anthropics/skills/tree/main/skills/skill-creator |
| OpenCode skills | https://opencode.ai/docs/skills/ |
| skills.sh docs | https://www.skills.sh/docs |
