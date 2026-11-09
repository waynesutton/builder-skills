# Files

One line per file that matters. What it is for, not how it works.

## Root

- `README.md` what this is, Convex setup, install (picker, commands, skills.sh, plugin), skills by group, starters, what moved in 3.0
- `MIGRATING.md` old package and 2.x skills to 3.0, the old to new map, owner publish and deprecate steps
- `AGENTS.md` context for agents working in this repo: what it is, skill rules, adding and retiring a skill, layout, skill table
- `CLAUDE.md` symlink to `AGENTS.md`
- `GEMINI.md` Gemini CLI context for Convex projects that use builder-skills
- `CONTRIBUTING.md` skill rules, how to add a skill, trying the CLI locally
- `docs.md` index of every document, skill, template, and tool in the repo
- `changelog.md` Keep a Changelog, dates from `git log`
- `files.md` this file
- `task.md` To Do / In Progress / Completed with UTC timestamps
- `LICENSE` Apache-2.0
- `package.json` `@waynesutton/builder-skills` 3.0.0, binary `builder-skills`, `check` and `prepublishOnly` scripts
- `index.js` programmatic API: `listSkills`, `listRetired`, `getSkill`, `getSkillPath`, `getSkillDir`, `getSkillMeta`, `SKILLS`, `GROUPS`, `MANIFEST`
- `skills.sh.json` groups on the skills.sh repo page: Workflow, Coding, Security, Writing, and the retired stubs
- `.gitignore` ignores node_modules, env files, `.claude/`, `.cursor/`, `.opencode/`, `.agents/`
- `.npmignore` keeps agent config folders, `prds/`, `scripts/`, and repo only docs out of the npm package

## bin/

- `cli.js` `builder-skills` CLI, zero dependencies. No arguments in a terminal opens the picker (skills, agents found in the project, starters). Commands: `add` (`install`), `add --all` (`install-all`), `list` (`--json`), `show` (`get`), `path`, `update`, `start`, `init` (`install-templates`). Flags: `--target` (comma list), `--dir`, `--link`, `--force`, `--yes`. Retired names print their replacement.

## packages/

- `builder-skills/` the unscoped npm alias. `cli.js` imports the main package's CLI, so `npx builder-skills` works.

## scripts/

- `check-skills.mjs` lint. Strict YAML scalar rules for frontmatter, name matches folder, line budgets (300 soft, 500 hard, 25 for stubs), references linked and one level deep, banned words and em dashes, no stale old name. Checks that `plugin.json`, `.codex/skills/`, the README tables, `skills.sh.json`, versions, and the alias dependency agree with `skills/manifest.json`. `npm run check`.
- `legacy-package/` final 1.1.0 of the old npm package name (see MIGRATING.md). README plus a bin that prints where everything moved.

## .claude-plugin/

- `plugin.json` Claude Code plugin manifest, `builder-skills` 3.0.0, lists active skills and retired stubs
- `marketplace.json` marketplace manifest so `claude plugin marketplace add waynesutton/builder-skills` works

## .codex/

- `README.md` how Codex discovers skills in this repo
- `skills/<name>` one symlink per active skill into `../../skills/<name>`

## skills/

- `manifest.json` groups, active skills with a one line summary, retired skills with their replacements. The source of truth for the CLI, `index.js`, and the lint.

Each skill folder has `SKILL.md`, `agents/openai.yaml` (Codex icon metadata), and `assets/` (icons). Some have `references/` loaded on demand from links in `SKILL.md`.

### Workflow

- `workflow/SKILL.md` triage, when a PRD is needed, task.md tracking, docs sync handoff, execution style, lessons loop. Routes to the other skills.
- `create-prd/SKILL.md` when to write or skip a PRD, naming, required sections, UTC metadata, queueing tasks after
  - `references/prd-template.md` the full PRD layout with notes on filling it in
- `update-project-docs/SKILL.md` `/update`: sync task.md, changelog.md, files.md from git evidence, Convex detection, redaction, commit message as plain text
  - `references/evidence-rules.md` strong vs weak vs not evidence, deriving facts, idempotency check, conflicts
  - `references/convex-detection.md` which file proves which Convex feature, components via convex.config.ts
- `git-safety/SKILL.md` status first, approval table for destructive commands, revert and undo mean edit, diff before discard
- `avoid-feature-creep/SKILL.md` the request sets the scope, creep signals, what to do instead
- `what-i-need-from-you/SKILL.md` end each turn with numbered asks (do, decide, approve), log them by id in `prds/what-i-need-from-you.md`

### Coding

- `think-first/SKILL.md` reflect before acting, 98 percent confidence bar, Convex rules and docs, Convex Auth, scope, UI, docs policy, git handoff
- `dev/SKILL.md` house style: core principles, Convex mutations and resources, Convex Auth, React, Resend, design system, docs, communication. Meant to be edited.

### Security

- `sec-check/SKILL.md` modes, project policy first, scanner and ledger, the finding gate, severity, verify a fix, report format, run log, pre ship gate
  - `references/rules.md` the 20 rules, component boundaries, AI generated code checks, common mistakes
  - `references/audit.md` full audit mode: run folder, recon, coverage units, hunt, verify, findings record
  - `references/patterns.md` copy paste fixes 1 to 19, including the SECURITY.md template and an authz test
  - `references/probe.md` manual checks, probing your own deployment, GitHub secret scanning alerts
  - `scripts/sec-scan.sh` bash 3.2 secret and pattern scanner
  - `scripts/surface.cjs` per function ledger, `--json`, `--strict`, `--diff`
  - `scripts/changelog.cjs` per repo run log outside the target repo

### Writing

- `write/SKILL.md` modes (write, proof, scan), voice matching, evidence rules, editorial principles, workflow, final checks
  - `references/formats.md` recipes for posts, articles, READMEs, commits, docs, tips, email, plus illustrative edits
  - `references/watchlist.md` filler, promotional, and structural patterns to check

### Retired stubs

- `convex-best-practices`, `convex-functions`, `convex-schema-validator`, `convex-realtime`, `convex-http-actions`, `convex-file-storage`, `convex-cron-jobs`, `convex-migrations`, `convex-agents`, `convex-component-authoring`, `convex-security-check`, `convex-security-audit`: each `SKILL.md` names its replacement and how to install it. Removed in 4.0.

## templates/

Copied into a user's project by `builder-skills init`. Nothing existing is overwritten.

- `AGENTS.md` project context starter: stack, Convex setup, docs first, commands, layout, rules, workflow with skill handoffs, style. `CLAUDE.md` gets symlinked to it.
- `files.md` starter with root, convex/, src/, prds/ sections
- `changelog.md` starter with Unreleased and a first version block
- `task.md` starter with To Do / In Progress / Completed
- `SECURITY.md` policy starter that sec-check reads first: reporting, scope, who can do what, public by design, invariants, accepted risk
- `prds/lessons.md` starter with one example lesson
- `prds/what-i-need-from-you.md` empty asks log: Open, Done, Session log

## prds/

- `builder-skills-3.md` PRD for 3.0: lean skill set, retired stubs, CLI picker, alias package
- `github-triage.md` drafted comments and gh commands for open issues and PRs, posted only after owner approval
- `builder-skills-rename.md` PRD for the 2.0.0 rename and skill rewrite
- `builder-skills-updates-plan.md` running plan for skill updates, renamed from the 1.x name
- `lessons.md` one line per lesson for this repo
- `how-it-works.md` how skills load across Claude Code, Codex, Cursor, OpenCode
- `skillsplan.md` the original 1.x skill plan
- `future-skills-exploration.md` candidate skills not yet built
- `create-convex-opencode-integration.md` how the OpenCode `/convex` command came together (removed in 3.0)
- `CLAUDE-MD-STRATEGY.md` why `CLAUDE.md` symlinks to `AGENTS.md`
- `archive/` finished or superseded: marketplace submission, Convex docs recommendations, convex.dev AI site recommendations
