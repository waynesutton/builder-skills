# Tasks

Three sections. Items move down as they land. An item moves to Completed only after its verification step ran. Timestamps in `YYYY-MM-DD HH:mm UTC`.

## To Do

Owner steps. Full commands in `MIGRATING.md`.

- [ ] Review the 3.0 diff (`git status`, `git diff --stat`). Read README, MIGRATING.md, and `skills/sec-check/SKILL.md` first. Commit and push `main`.
- [ ] Approve `prds/github-triage.md`, then the agent posts the comments and closes #4, #8, #11 and PRs #6, #9, #10.
- [ ] `npm login`, then `npm publish --access public` for `@waynesutton/builder-skills` 3.0.0.
- [ ] `cd packages/builder-skills && npm publish` for the `builder-skills` alias. If npm rejects the name, drop `npx builder-skills` from the docs.
- [ ] `npm deprecate @waynesutton/convex-skills "Renamed to @waynesutton/builder-skills (npx builder-skills). Convex skills moved to github.com/convex/agent-skills"`.
- [ ] Optional: publish `scripts/legacy-package/` as `@waynesutton/convex-skills` 1.1.0, then run the deprecate again.
- [ ] After the push, run `npx skills add waynesutton/builder-skills --skill write -y` once so skills.sh reads `skills.sh.json`. Check the page groups.
- [ ] After the push, in a scratch project with an old `convex-functions` install, run `npx skills update` and confirm it receives the stub.
- [ ] Test `claude plugin marketplace add waynesutton/builder-skills` then `claude plugin install builder-skills@waynesutton`.
- [ ] Update the link on waynesutton.ai.
- [ ] 4.0: delete the 12 retired stub folders, set `stub: false` on their manifest entries, and drop them from `plugin.json` and `skills.sh.json`.
- [ ] Optional: rename the local folder to `builder-skills`.

## In Progress

## Completed

- [x] 2026-11-09 07:40 UTC builder-skills 3.0.0. `prds/builder-skills-3.md`. Convex API skills retired (12 stubs, `convex` deleted). New `sec-check`, `write`, `workflow`, `create-prd`, `update-project-docs`, `think-first`, `dev`, `what-i-need-from-you`. `skills/manifest.json`, CLI picker and commands, `packages/builder-skills` alias, `scripts/legacy-package`, `skills.sh.json`, `templates/SECURITY.md`, `templates/prds/what-i-need-from-you.md`, `MIGRATING.md`, lint rewrite, docs. Verified: `npm run check` 0 errors 0 warnings; `npx skills add <copy> --list` finds 22 with no skips; picker driven through a pty installs into the detected `.cursor`; `add --all --target claude,codex` writes 10 each; retired names print replacements and exit 1; `update` skips edited `dev`; `init` skips on rerun; packed tarballs install and `npx builder-skills` runs; sec-check scripts run on a sample.

- [x] 2026-09-28 05:50 UTC GitHub steps approved by owner. `git mv agents.md AGENTS.md` so the `CLAUDE.md` symlink resolves. Committed `82d1ce2`. Renamed repo `waynesutton/convexskills` to `waynesutton/builder-skills` with `gh repo rename`, set `origin` to the new URL, pushed `main`. Set repo description, homepage, and topics. Verified with `gh repo view`.

- [x] 2026-09-16 02:20 UTC Rename to builder-skills and rewrite every skill. `prds/builder-skills-rename.md`. Files: `package.json`, `bin/cli.js`, `index.js`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (new), `.gitignore`, `.npmignore`, `scripts/check-skills.mjs` (new), all 14 `skills/*/SKILL.md`, 13 new `references/*.md`, 3 new skills (`project-workflow`, `project-docs`, `git-safety`) with `agents/` and `assets/`, 3 new `.codex/skills/` symlinks, `templates/` restructured (5 starters, `dev` and `help` as folders, `CLAUDE.md` and flat skill files removed), `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `GEMINI.md`, `docs.md`, `command/convex.md`, `.codex/README.md`, `changelog.md`, `files.md`, `task.md`, `prds/lessons.md` (new), `prds/archive/` (3 finished PRDs moved, `convex-skills-updates-plan.md` renamed `builder-skills-updates-plan.md`). Verified: `node bin/cli.js list` prints 17; `install-templates` into `/tmp/bs-test` creates 8 files and skips all 8 on rerun; `install-all --target cursor` writes 17 folders with references to `.cursor/skills`; `npm run check` exits 0; every `SKILL.md` under 300 lines; no old name outside `changelog.md` and `prds/`.

## Earlier work (1.x)

Kept for history. Details in `changelog.md`.

- [x] 2026-02-05 README and npm description point at official Convex Agent Plugins
- [x] 2026-02-05 Consolidated `convex-eslint` into `convex-best-practices`
- [x] 2026-02-03 `.agents/skills` install target and `--link` flag
- [x] 2026-02-02 Removed unsupported frontmatter fields for Pi skill parser
- [x] 2026-02-02 Codex skill icons via `agents/openai.yaml`
- [x] 2026-02-02 Retrieval led reasoning and llms.txt index in AGENTS.md, CLAUDE.md, GEMINI.md
- [x] 2026-01-23 Skill `name` field matches folder name so slash commands resolve
- [x] 2026-01-18 OpenCode slash command support
- [x] 2026-01-17 AI agents as stakeholders in `avoid-feature-creep`
- [x] 2026-01-14 Initial 12 skills, templates, CLAUDE.md strategy, docs index
