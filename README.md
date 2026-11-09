# builder-skills

[![skills.sh](https://skills.sh/b/waynesutton/builder-skills)](https://skills.sh/waynesutton/builder-skills)
[![npm](https://img.shields.io/npm/v/@waynesutton/builder-skills)](https://www.npmjs.com/package/@waynesutton/builder-skills)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Workflow, building, and writing skills for builders shipping Convex apps. By [Wayne Sutton](https://waynesutton.ai).

Ten skills that teach a coding agent how to run a project: triage before code, write a PRD, keep `task.md`, `changelog.md`, and `files.md` true from git, never run a git command that destroys work, check security before you ship, and write like you. They work with Threadbear,Claude Code, Codex, Cursor, OpenCode, and any agent that reads a `SKILL.md`.

```bash
npx builder-skills
```

## Set up Convex first

Convex knowledge (functions, schema, auth, crons, migrations, components) now comes from the official Convex skills and plugins. Use those for Convex APIs. Use builder-skills for everything around them.

The fastest way in is to tell your agent:

```
Read https://www.convex.dev/agent-setup.md and follow it.
```

That installs the Convex AI files (`convex/_generated/ai/guidelines.md` and `.agents/skills`) and the Convex plugin for each coding agent on your machine. To do it by hand:

```bash
npx convex ai-files install                         # in a Convex project
npx skills add convex/agent-skills                  # official Convex skills, any agent

claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install convex@claude-plugins-official --scope user

codex plugin marketplace add convex/convex-codex-plugin
codex plugin add convex@convex-codex-plugin
```

For Cursor, see [convex/convex-agent-plugins](https://github.com/convex/convex-agent-plugins). The full list of official skills is at [docs.convex.dev/ai/agent-skills](https://docs.convex.dev/ai/agent-skills).

## Install

Run it with no arguments and pick what you want:

```
$ npx builder-skills

builder-skills 3.0.0
Workflow
   1  workflow               Triage, PRD, task.md, docs sync, lessons loop
   2  create-prd             Write a PRD in prds/ before non trivial work
   ...
Skills to add [Enter = all, or 1,3,9 or 1-6]:

Agents
   1  Claude Code            .claude/skills  (found)
   2  Codex                  .codex/skills
   ...
Install for [Enter = Claude Code]:

Add project starters (AGENTS.md, task.md, changelog.md, files.md, SECURITY.md, prds/)? [y/N]:
```

It finds the agent folders already in your project and selects them by default. Nothing is installed until you answer the last prompt.

Or skip the prompts:

```bash
npx builder-skills add --all
npx builder-skills add workflow create-prd update-project-docs sec-check
npx builder-skills add --all --target claude,codex
npx builder-skills init                 # project starters only
npx builder-skills list                 # what is available (--json for agents)
npx builder-skills update               # refresh what you installed
npx builder-skills start                # a short router an agent can follow
```

`--target` takes `claude` (`.claude/skills`), `codex` (`.codex/skills`), `cursor` (`.cursor/skills`), `opencode` (`.opencode/skills`), `agents` (`.agents/skills`), a path, or a comma separated list. `--link` symlinks instead of copying. `npx @waynesutton/builder-skills` works the same as `npx builder-skills`.

<details>
<summary><strong>skills.sh</strong></summary>

```bash
npx skills add waynesutton/builder-skills
npx skills add waynesutton/builder-skills --skill sec-check --skill write
```

The installer asks which skills and which agents. It writes ordinary files you can edit. Pull updates with `npx skills update`.

</details>

<details>
<summary><strong>Claude Code plugin</strong></summary>

```bash
claude plugin marketplace add waynesutton/builder-skills
claude plugin install builder-skills@waynesutton
```

</details>

## Skills

### Workflow

| Skill | Use when |
| --- | --- |
| [workflow](skills/workflow/SKILL.md) | Multi step work. Triage, PRD, `task.md`, docs sync, lessons loop |
| [create-prd](skills/create-prd/SKILL.md) | Before a multi file feature, a schema change, or a hard bug |
| [update-project-docs](skills/update-project-docs/SKILL.md) | A change landed. `/update` syncs the three docs from git and prints the commit message |
| [git-safety](skills/git-safety/SKILL.md) | Any git command that could discard work |
| [avoid-feature-creep](skills/avoid-feature-creep/SKILL.md) | Scope is drifting past the request |
| [what-i-need-from-you](skills/what-i-need-from-you/SKILL.md) | Every turn. Ends with the exact asks, logged by id in `prds/` |

### Coding

| Skill | Use when |
| --- | --- |
| [think-first](skills/think-first/SKILL.md) | A bug, a fix that did not work, or a vague request. Root cause first |
| [dev](skills/dev/SKILL.md) | Writing app code in my house style: React, Convex, Convex Auth, Resend. Edit it to make it yours |

### Security

| Skill | Use when |
| --- | --- |
| [sec-check](skills/sec-check/SKILL.md) | Before a deploy, before a repo goes public, after AI generated code, or to verify a fix |

`sec-check` ships a secret scanner and a per function ledger in `scripts/`, then makes the agent prove an attacker path before it calls anything a finding. It covers leaked keys, client prefixed secrets, public functions with no auth, identity taken from args, paid AI spend, unsigned webhooks, open uploads, unsafe HTML, prompt injection into agent tools, and CI deploy keys. Every rule comes from a mistake that shipped.

### Writing

| Skill | Use when |
| --- | --- |
| [write](skills/write/SKILL.md) | Drafting or proofing posts, docs, READMEs, emails, and commit messages |

## Project starters

`npx builder-skills init` (or `y` at the last picker prompt) adds these to your project root. Nothing that exists is overwritten.

| File | What it is |
| --- | --- |
| `AGENTS.md` (+ `CLAUDE.md` symlink) | Stack, commands, Convex rules, which skill to load when |
| `task.md` | To Do, In Progress, Completed, with UTC timestamps |
| `changelog.md` | Keep a Changelog. Dates from `git log`, never invented |
| `files.md` | One line per file. What it is for |
| `SECURITY.md` | What is public by design, who can do what, accepted risks. `sec-check` reads it first |
| `prds/lessons.md` | One line per lesson. Read at session start |
| `prds/what-i-need-from-you.md` | The asks log for `what-i-need-from-you` |

## How I build with these

The loop is short. Ask for the change. The agent triages, writes a PRD in `prds/`, builds against it, and moves the task through `task.md`. When it lands, `/update` reads the git evidence, syncs the three docs, and prints a commit message. Before a deploy, `sec-check`. I commit.

A project run this way ends up with these next to the code:

```
prds/          one PRD per non trivial change, lessons.md, what-i-need-from-you.md
task.md        what is queued, in flight, and done, with UTC timestamps
changelog.md   what shipped, dated from git log
files.md       what every file is for
SECURITY.md    the policy sec-check checks against
```

## Why this exists next to the official Convex skills

Convex's own skills know Convex best, so this repo no longer tries to. It covers the parts of shipping that are not Convex APIs: planning, tracking, docs that match the code, git habits, security review, and writing.

## Moved in 3.0

The Convex skills that used to live here moved to the official set. Each of the old folders below (except `convex`) still ships for one release as a short stub that names its replacement, so `npx skills update` tells you where to go. Run `npx builder-skills add <old-name>` and the CLI prints the replacement too. The old content is at [commit 82d1ce2](https://github.com/waynesutton/builder-skills/tree/82d1ce2/skills).

| Old skill | Use instead |
| --- | --- |
| `convex` | official `convex` |
| `convex-functions`, `convex-schema-validator`, `convex-realtime`, `convex-http-actions`, `convex-file-storage` | official `convex-design`, plus `convex/_generated/ai/guidelines.md` |
| `convex-best-practices` | official `convex-reviewer`, `convex-optimize` |
| `convex-cron-jobs` | official `convex-crons` |
| `convex-migrations` | official `convex-migrate`, `convex-migrate-rehearse` |
| `convex-agents` | official `convex-agent` |
| `convex-component-authoring` | official `convex-create-component` |
| `convex-security-check`, `convex-security-audit` | `sec-check`, plus official `convex-authz` |
| `project-workflow` | `workflow` and `create-prd` |
| `project-docs` | `update-project-docs` |
| `help` (template) | `think-first` |

Coming from the old npm package? See [MIGRATING.md](MIGRATING.md).

## How a skill is built

```
skills/sec-check/
  SKILL.md               under 300 lines: when to use it, the steps, the checklist
  references/rules.md    loaded only when the task needs it
  scripts/sec-scan.sh    run with bash, so file modes do not matter
  agents/openai.yaml     icon metadata for Codex
  assets/                icons
```

Frontmatter is `name` and a quoted `description` only. The description says what the skill does and ends with a `Use when ...` sentence, because that is what the agent reads to decide whether to load it. Deep material sits one hop away in `references/`. This follows Anthropic's [skill authoring guide](https://github.com/anthropics/skills/tree/main/skills/skill-creator) and the [OpenCode skills docs](https://opencode.ai/docs/skills/).

`skills/manifest.json` is the one list of skills, groups, and retired names. The CLI, `index.js`, and the lint read it.

## Programmatic use

```js
import { listSkills, getSkill, getSkillMeta, listRetired, GROUPS } from "@waynesutton/builder-skills";

listSkills();                     // ["workflow", "create-prd", ...]
getSkillMeta("sec-check");        // { name, description }
getSkill("git-safety");           // raw SKILL.md
listRetired();                    // [{ name, stub, replacement }]
```

## Repo layout

```
skills/              the 10 skills, 12 retired stubs, manifest.json
templates/           starters copied by init
bin/cli.js           the CLI
index.js             programmatic API
packages/builder-skills/  the short npx name, forwards to the main package
scripts/             check-skills.mjs (npm run check), the redirect package for the old npm name
skills.sh.json       how the skills.sh page groups skills
.claude-plugin/      plugin.json and marketplace.json
.codex/skills/       symlinks into skills/ so Codex finds them in this repo
prds/                PRDs for this repo and lessons.md
AGENTS.md            agent context for this repo (CLAUDE.md symlinks here)
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In short: keep `SKILL.md` under 300 lines, quote the description, link every reference file, and make sure `npm run check` passes.

## Related

- [Convex docs](https://docs.convex.dev) and [llms.txt](https://docs.convex.dev/llms.txt)
- [convex/agent-skills](https://github.com/convex/agent-skills), the official Convex skills
- [convex/convex-agent-plugins](https://github.com/convex/convex-agent-plugins), the official Convex plugins
- [Convex agent setup](https://www.convex.dev/agent-setup.md)
- [skills.sh](https://skills.sh), the installer
- [ui-skills](https://www.ui-skills.com), the CLI shape this one borrows

## License

Apache-2.0. See [LICENSE](LICENSE).
