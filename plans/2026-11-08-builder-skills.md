# Plan: Update builder-skills repo, sync with Convex docs

2026-11-09 · builder-skills · made in Threadbear's Plan mode

# builder-skills 3.0.0: workflow, security, and writing skills, official Convex for the rest

## Context

Convex now ships about 40 official skills (`convex/agent-skills`), plugins for Claude Code, Codex, and Cursor (`convex/convex-agent-plugins`), and a one-shot setup page (https://www.convex.dev/agent-setup.md). Our 13 `convex-*` skills duplicate that work, and our `convex` skill has the same name as the official one.

Issue #11 is a real bug. Ten descriptions contain an unquoted `: `, so `npx skills add` finds only 7 of the 17 skills. PR #12 fixes it. Our lint missed it because it parses frontmatter by hand.

`@waynesutton/builder-skills` has never been published to npm, and `@waynesutton/convex-skills` 1.0.9 is still live and not deprecated.

The skills.sh page shows 37.7K installs, about 36K of them on the convex-* skills.

What you decided:
- The Convex skills move to official. Delete `convex`, which clashes by name. The other 12 become redirect stubs for one release.
- The skills you use in your own projects become the canonical workflow set:
  - `workflow`, `create-prd`, and `update-project-docs` replace `project-workflow` and `project-docs`, keeping the stronger rules from both.
  - `dev` and `help` move from templates to real skills. `help` is renamed `think-first`, because `/help` is a built-in command in Claude Code.
  - `what-i-need-from-you` is added.
- `sec-check` is built from builder-sec-check, which I read but never change. `write` comes from `~/Downloads/writing-skill.md`.
- The terminal experience is modelled on `npx ui-skills`. We also publish an unscoped `builder-skills` alias, so people can run `npx builder-skills`.
- GitHub comments and closes are drafted for your approval before anything is posted. PR #12 is merged first so cgalo gets credit.
- The version is 3.0.0.

### Final active set (10)

| Group | Skill | Source |
| --- | --- | --- |
| Workflow | `workflow` | yapper `.agents/skills/workflow` + `project-workflow` (triage, lessons loop, PRD metadata) |
| Workflow | `create-prd` | yapper `create-prd` + the PRD template from `project-workflow` |
| Workflow | `update-project-docs` | yapper `update-project-docs` + `project-docs` (git evidence only, component check, secret scan) |
| Workflow | `git-safety` | existing |
| Workflow | `avoid-feature-creep` | existing |
| Workflow | `what-i-need-from-you` | `~/Documents/sites/repos/what-i-need-from-you/SKILL.md` (read only) |
| Coding | `think-first` | yapper `help`: WorkOS removed, Convex Auth added |
| Coding | `dev` | yapper `dev`: Clerk and WorkOS removed, Convex Auth kept |
| Security | `sec-check` | builder-sec-check + old local sec-check + convex-security-check/audit |
| Writing | `write` | `~/Downloads/writing-skill.md` |

Rules for every skill:
- Frontmatter is `name` plus a quoted, third-person `description` ending in a `Use when ...` sentence.
- Under 300 lines. No em dashes.
- Each skill gets `agents/openai.yaml` and `assets/`, reusing the existing icon set.
- Every Convex claim is checked against https://docs.convex.dev/llms.txt.

## Step 0: merge PR #12 (asks for your OK when we get there)

Run `git status`, then `gh pr merge 12 -R waynesutton/builder-skills --squash`, then `git pull --ff-only`. Everything after this builds on the merged tree.

## Step 1: PRD

Write `prds/builder-skills-3.md` with the scope, the map from old skills to new, the CLI design, and the verification steps. Use the new `create-prd` format.

## Step 2: retire old skills

- Delete `skills/convex/`.
- Turn the other 12 `convex-*` folders into stubs, each under 25 lines:
  - The quoted description is narrow, for example "Retired. Points to the official Convex skill that replaced convex-functions. Use when /convex-functions is invoked by name or the user asks where it went."
  - The body names the replacement, gives the install commands (agent-setup.md, plugin, `npx skills add convex/agent-skills --skill <x>`), links the old content at `tree/82d1ce2`, and ends with "delete this folder after you switch".
  - Keep `agents/` and `assets/`. Delete `references/`.
- Delete `skills/project-workflow` and `skills/project-docs` outright (3 installs each), and delete `templates/skills/`.
- Replacement map, used by the CLI `REMOVED` map, the stubs, and the README. Check each official name with `gh api repos/convex/agent-skills/contents/skills` before writing it.

| Old | New |
| --- | --- |
| convex | official `convex` |
| convex-functions, -schema-validator, -realtime, -http-actions, -file-storage | `convex-design` + `convex/_generated/ai/guidelines.md` |
| convex-best-practices | `convex-reviewer`, `convex-optimize` |
| convex-cron-jobs | `convex-crons` |
| convex-migrations | `convex-migrate`, `convex-migrate-rehearse` |
| convex-agents | `convex-agent` |
| convex-component-authoring | `convex-create-component` |
| convex-security-check, convex-security-audit | `sec-check` + official `convex-authz` |
| project-workflow | `workflow` + `create-prd` |
| project-docs | `update-project-docs` |
| help (template) | `think-first` |
| dev (template) | `dev` skill |

- New `skills.sh.json` (display only, per skills.sh/docs/customize):
  - Groups: Workflow, Coding, Security, Writing, and "Moved to official Convex skills" for the stubs.
  - `notGrouped: "bottom"`.
  - It takes effect after the next telemetry-enabled install. That becomes an owner step in `task.md`.
- `.codex/skills/` holds symlinks for the 10 active skills only.
- Delete `command/convex.md`.

## Step 3: new and merged skills

- **`workflow`.** Triage first, then hand off: PRD writing to `create-prd`, docs sync to `update-project-docs`, git commands to `git-safety`, asks to `what-i-need-from-you`.
  - Covers task.md tracking, subagent use, and the lessons loop.
  - Headings follow the templates (`## To Do`, `## In Progress`, `## Completed`).
- **`create-prd`.**
  - Adds frontmatter.
  - The template from yapper, plus `Created`, `Last Updated`, and `Status` lines and a task completion log.
  - "When to write one, when to skip". `TASK.md` becomes `task.md`.
- **`update-project-docs`.**
  - Triggers: `/update`, `@update`, "sync docs".
  - The yapper steps (git log and diff stat, task, changelog, files, then print only the commit message).
  - From `project-docs`: never log anything the code doesn't show, check components against `convex.config.ts`, scan for secrets before saving.
  - Uses `## Completed`, not `## Recently Completed`, to match the templates.
- **`think-first`** (from yapper `help`).
  - Drop the three WorkOS lines. Add an Auth line: Convex Auth https://docs.convex.dev/auth/convex-auth (beta; the URL may move, so it lives in one place), plus https://docs.convex.dev/auth for other providers.
  - Fix two Convex claims the docs don't support:
    - Ownership checks become "load the doc and compare its owner to the caller, or query by an owner index". The original says `ctx.db.get()` is wrong for this, and it isn't.
    - `Promise.all` is for independent reads and does not prevent write conflicts. Point OCC questions to the docs.
- **`dev`.**
  - Remove Clerk and WorkOS from the intro line. Keep the Convex Auth section, linking https://docs.convex.dev/auth/convex-auth and https://labs.convex.dev/auth.
  - Same two Convex fixes as above.
  - Add one line: "This is house style. Edit it to match your project."
- **`what-i-need-from-you`.** Copied as is, with the description quoted.
- **`sec-check`.**
  - `SKILL.md` under 300 lines: one idea, modes, policy first, quick workflow, severity, verify a fix, not findings, report, pre ship gate.
  - `references/`: `rules.md` (20 rules, plus component boundaries and AI generated code checks from the old local sec-check), `audit.md`, `patterns.md`, `probe.md`.
  - `scripts/`: `sec-scan.sh`, `surface.cjs`, `changelog.cjs`, with only the name strings changed. They are run with `bash` and `node`, so file modes don't matter.
  - Cross-links between references are removed, since the lint enforces one level deep. Confirm with `ls -la` that the source folder is unchanged.
- **`write`.**
  - Third-person, quoted description.
  - Move "Format recipes" and "Illustrative edits" to `references/formats.md` and "Editing watchlist" to `references/watchlist.md`.

## Step 4: CLI, zero dependencies, modelled on `npx ui-skills`

`bin/cli.js`:

- **No args in a TTY opens the picker:**
  1. The skills, numbered and grouped. Press Enter for all, or type numbers like `1,3,9`.
  2. Agent targets, with the folders it finds pre-selected (`.claude`, `.agents`, `.codex`, `.cursor`, `.opencode`).
  3. "Add project starters? (AGENTS.md, task.md, changelog.md, files.md, SECURITY.md) y/N".
  4. A summary, then next steps: the agent-setup.md line for Convex, and how to update.

  Built with `readline`. Respects `NO_COLOR`.
- No args without a TTY, as in CI or an agent shell, prints help and exits 0.
- **Commands:**
  - `add <skills...>` (alias `install`), `add --all` (alias `install-all`)
  - `list` (grouped), `list --json` for agents
  - `show <skill>` (alias `get`), `path <skill>`
  - `start`: prints a short router that tells an agent which skill fits which task, and to use official Convex skills for Convex APIs. This mirrors `ui-skills start`.
  - `update`: re-copies the installed builder skills in the target. It skips `dev` unless named, since `dev` is meant to be edited.
  - `init` (alias `install-templates`): the project starters
- **Flags:** `--target claude,codex` (comma list), `--dir`, `--link`, `--yes` (skip prompts, use defaults).
  - `opencode` maps to `.opencode/skills`, OpenCode's own folder (it also reads `.claude/skills` and `.agents/skills`).
- **Retired names:** `add convex-functions` prints its replacement from `REMOVED`, and exits 1 if nothing was installed. `install-all` never installs stubs.
- `index.js` exports `listSkills()` (active only), `listRetired()`, `getSkill`, `getSkillMeta`, and `GROUPS`. There is one source of truth: a `skills/manifest.json` with name, group, one-liner, and status (active or retired). The CLI, `index.js`, and the lint all read it, which ends the three hand-synced lists.

**Alias package** in `packages/builder-skills/`:
- `package.json` has `name: builder-skills`, `bin: builder-skills`, and the dependency `"@waynesutton/builder-skills": "^3.0.0"`.
- `cli.js` contains one line: `import "@waynesutton/builder-skills/bin/cli.js"`.
- Add a README.
- The root `.npmignore` and `files` keep it out of the main tarball.

## Step 5: lint (`scripts/check-skills.mjs`)

- Fail on any unquoted frontmatter value that contains `: ` or starts with a YAML indicator character (the #11 class of bug).
- Validate `skills/manifest.json` against the `skills/` folders.
  - Active skills: full checks.
  - Retired stubs: must stay under 25 lines and appear in `REMOVED`.
- Check that `plugin.json` lists active skills plus stubs, and that `.codex/skills/`, the README skill table, and `skills.sh.json` match the manifest.
- Check that the alias package's dependency range matches the root major version.
- Skip the banned-word scan for `skills/write/references/watchlist.md`. Allow the old package name in `MIGRATING.md` and `scripts/legacy-package/`.

## Step 6: manifests and package

- Version 3.0.0 in `package.json`, `plugin.json`, and `marketplace.json`. Descriptions say "10 skills".
- `plugin.json` lists active skills plus stubs, so plugin users get the redirects.
- `package.json`:
  - add `files` entries: `skills/manifest.json`, `skills/**/scripts/*`, `templates/SECURITY.md`
  - update the description
  - keywords: add `security`, `writing`, `prd`; drop the Convex-only terms

## Step 7: templates

- `templates/AGENTS.md`:
  - "Convex setup": follow agent-setup.md, read `convex/_generated/ai/guidelines.md` first, use official Convex skills for Convex APIs
  - point to `workflow`, `update-project-docs`, `git-safety`, `sec-check` before deploy, `write` for prose, `what-i-need-from-you`
  - auth line: Convex Auth
- New `templates/SECURITY.md`, from sec-check pattern 18, because `sec-check` reads it first.
- Keep `templates/prds/lessons.md`. Add `templates/prds/what-i-need-from-you.md`, the empty Open/Done/Session log layout.
- Align `templates/task.md` headings with `workflow`.

## Step 8: README, MIGRATING.md, repo docs

Written using the `write` skill.

- **README:**
  - Opens with what it is: workflow, security, and writing skills for people shipping Convex apps.
  - `npx builder-skills` up front, with a short sample of the picker.
  - "Set up Convex first": agent-setup.md, `npx convex ai-files install`, the Claude and Codex plugin commands, `npx skills add convex/agent-skills`, and a link to convex-agent-plugins.
  - A grouped table of the 10 skills, and a "Moved" table.
  - Other ways to install: skills.sh, the Claude plugin, the scoped npm package.
  - `init` starters. "Edit `dev` after installing".
  - Two sentences on why this exists next to the official skills (answers #8).
  - A link to MIGRATING.md.
- **MIGRATING.md, owner publish steps:**
  1. `npm login`
  2. `npm run check`
  3. `npm pack --dry-run`
  4. `npm publish --access public --otp <code>`
  5. `cd packages/builder-skills && npm publish --otp <code>`. If npm rejects the name, drop the alias and say so in the README.
  6. `npm view` both names
  7. `npm deprecate @waynesutton/convex-skills "Renamed to @waynesutton/builder-skills (npx builder-skills). Convex skills moved to github.com/convex/agent-skills"`
  8. Optional: publish `@waynesutton/convex-skills@1.1.0` from `scripts/legacy-package/`, whose bin prints the move.

  **User steps:** uninstall the old package, run `npx builder-skills`, remove old `.claude/skills/convex-*` folders, install the official plugin. Include the full old-to-new map.
- **Repo docs:**
  - `AGENTS.md` (also `CLAUDE.md`): count, table, and the rule for adding a skill (now "add it to `skills/manifest.json`")
  - `GEMINI.md`, `CONTRIBUTING.md`, `docs.md`, `.codex/README.md`
  - `changelog.md` `[3.0.0]`
  - `files.md`
  - `task.md`: publish, deprecate, triage approval, the skills.sh.json refresh install, and "remove stubs in 4.0". Drop "claim skills.sh".
  - `prds/lessons.md`: lint with strict YAML rules

## Step 9: GitHub triage draft (`prds/github-triage.md`, posted only after you approve)

| Item | Action | Gist |
| --- | --- | --- |
| PR #12 | merge (Step 0) | thanks, ships in 3.0.0 |
| #11 | close | fixed by #12. Lint now blocks unquoted `: ` |
| #8 | close | official skills are the default for Convex. This repo now ships workflow, security, and writing skills |
| #4 | close | overlap resolved: Convex skills moved to official. Map in README |
| PR #10 | close | thanks. Moved to official, and `last-updated` frontmatter breaks Pi (#7) |
| PR #9 | close | thanks. Same direction, taken further |
| PR #6 | close | thanks. README now says any agent that reads `SKILL.md` |
| repo | `gh repo edit` | new description and topics |

## Verification

- `npm run check` exits 0. All 10 active skills are under 300 lines and every stub is under 25.
- `npx skills add . --list` (from a temp copy) finds 22 skills (10 active, 12 stubs) with no `Skipped` lines, which confirms #11 is fixed.
- In a scratch dir, `npx skills add waynesutton/builder-skills#82d1ce2 --skill convex-functions` shows how an old install is locked. This tells us whether `skills update` will swap in the stub after the push. Report the result either way.
- `node bin/cli.js` driven through a pseudo-TTY with scripted input (`script -q /dev/null` piping `1,9\n\ny\n`) installs the chosen skills into `/tmp/bs-test`. The non-TTY run prints help.
- `add --all --target claude,codex --dir /tmp/bs-test` writes 10 folders to each target, including `sec-check/scripts/`.
- `add convex-functions` prints its replacement and exits 1.
- `list --json` parses. `start` prints the router.
- `update` overwrites everything but `dev`.
- `init` creates the starters and skips them on a second run.
- `npm pack --dry-run` includes the manifest, scripts, and references, and leaves out `prds/`, `packages/`, and `task.md`.
- `npm pack` the root, then install that tarball plus the alias from `packages/builder-skills` into a temp dir. `npx builder-skills list` works.
- Run `sec-scan.sh` and `surface.cjs` against a sample. `diff` against builder-sec-check shows only the name changes.
- `grep -r "—"` over `skills/`, `README.md`, and `templates/` returns nothing. The `WorkOS` and `Clerk` greps over `skills/` return nothing.
- The builder-sec-check and what-i-need-from-you folders are unchanged.
- No commit, push, publish, or tag. Print a suggested commit message and update the threadbear project state.
