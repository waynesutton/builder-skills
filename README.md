# For official Convex Skills use Convex Agent Plugins

Official Convex plugins for AI coding agents, providing development tools for building reactive backends with TypeScript.

https://github.com/get-convex/convex-agent-plugins


## Convex (unofficial) Skills 

[![npm version](https://img.shields.io/npm/v/@waynesutton/convex-skills.svg)](https://www.npmjs.com/package/@waynesutton/convex-skills)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A collection of AI-consumable skills for building production-ready applications with [Convex](https://convex.dev), following the Agent Skills open format.

## Overview

This repository contains skills that help AI assistants understand and implement Convex best practices. Each skill provides structured guidance for specific aspects of Convex development.

## Code Quality

All skills are designed to produce code that passes @convex-dev/eslint-plugin by default. This creates a complementary workflow:

- **Skills** prevent mistakes at generation time
- **ESLint** catches anything that slips through at build time

See the Code Quality section in [convex-best-practices](/skills/convex-best-practices/SKILL.md) for setup instructions.

## Installation

### npm (recommended)

```bash
# Install globally for CLI access
npm install -g @waynesutton/convex-skills

# List available skills
convex-skills list

# Install a specific skill to your project
convex-skills install convex-best-practices

# Install all skills
convex-skills install-all

# Install all skills to .agents/skills
convex-skills install-all --target agents

# Symlink SKILL.md files instead of copying
convex-skills install-all --target agents --link

# Install templates (CLAUDE.md + skill templates)
convex-skills install-templates
```

Or use npx without installing:

```bash
npx @waynesutton/convex-skills list
npx @waynesutton/convex-skills install-all
```

### Programmatic Usage

```bash
npm install @waynesutton/convex-skills
```

```javascript
import { listSkills, getSkill, SKILLS } from "@waynesutton/convex-skills";

// List all skills
console.log(listSkills());

// Get a specific skill's content
const content = getSkill("convex-best-practices");
```

### Claude Code (from local clone)

```bash
git clone https://github.com/waynesutton/convexskills.git
cd convexskills
# Point Claude Code to this directory
```

### Codex

Follow the Codex skills guide and place the skill under `$CODEX_HOME/skills`:

```bash
# From the repo root
# Defaults to ~/.codex if CODEX_HOME is unset
cp -r skills/convex-best-practices "$CODEX_HOME/skills/"
```

Codex will auto-discover `SKILL.md` files in that directory on the next start.

If you are working from a repo clone, Codex also auto-discovers skills from `.codex/skills` at the repo root. You can symlink this repo’s `skills/*` into `.codex/skills` so updates flow through without copying.

### Standard Agent Skills Path

Some tools are standardizing on `.agents/skills` for discovery. This repo supports that layout via the CLI:

```bash
convex-skills install-all --target agents
convex-skills install-all --target agents --link
```

### OpenCode

OpenCode discovers skills from `~/.claude/skills/<name>/SKILL.md` automatically. See OpenCode Skills docs for more details.

#### Slash Command

This repo includes a `/convex` slash command for OpenCode. Install the command by copying `command/convex.md` to your OpenCode commands directory:

```bash
# Copy the slash command
cp command/convex.md ~/.opencode/command/

# Usage in OpenCode
/convex create a schema with users and posts
/convex set up file uploads
/convex add a Stripe webhook endpoint
```

The slash command provides decision trees to route to the appropriate skill based on your task.

### Manual Installation

Copy the desired skill's `SKILL.md` file to your project's `.claude/skills/` directory.

## Available Skills

| Skill                                                                    | Description                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| [convex-best-practices](skills/convex-best-practices/SKILL.md)           | Guidelines for building production-ready Convex apps  |
| [convex-functions](skills/convex-functions/SKILL.md)                     | Writing queries, mutations, actions, and HTTP actions |
| [convex-realtime](skills/convex-realtime/SKILL.md)                       | Patterns for building reactive applications           |
| [convex-schema-validator](skills/convex-schema-validator/SKILL.md)       | Database schema definition and validation             |
| [convex-file-storage](skills/convex-file-storage/SKILL.md)               | File upload, storage, and serving                     |
| [convex-agents](skills/convex-agents/SKILL.md)                           | Building AI agents with Convex                        |
| [convex-cron-jobs](skills/convex-cron-jobs/SKILL.md)                     | Scheduled functions and background tasks              |
| [convex-http-actions](skills/convex-http-actions/SKILL.md)               | HTTP endpoints and webhook handling                   |
| [convex-migrations](skills/convex-migrations/SKILL.md)                   | Schema evolution and data migrations                  |
| [convex-security-check](skills/convex-security-check/SKILL.md)           | Quick security audit checklist                        |
| [convex-security-audit](skills/convex-security-audit/SKILL.md)           | Deep security review patterns                         |
| [convex-component-authoring](skills/convex-component-authoring/SKILL.md) | Creating reusable Convex components                   |

## Repository Structure

```
convex-skills/
├── skills/                   # Core Convex skills for AI agents
│   ├── convex-best-practices/
│   │   └── SKILL.md
│   ├── convex-functions/
│   │   └── SKILL.md
│   ├── convex-cron-jobs/
│   │   └── SKILL.md
│   └── ...
├── .codex/                   # Codex integration (symlink skills here)
│   └── README.md             # Codex setup instructions
├── .agents/                  # Standard agent skills path
├── command/                  # Slash command definitions (OpenCode)
│   └── convex.md             # /convex command entrypoint
├── templates/                # Templates for forking developers
│   ├── CLAUDE.md             # Project context template
│   └── skills/               # Claude Code skill templates
│       ├── dev.md            # Full-stack development practices
│       ├── help.md           # Problem-solving methodology
│       └── gitrules.md       # Git safety protocols
├── .claude/skills/           # Active skills for this repo
├── prds/                     # Planning documents
├── AGENTS.md                 # Agent-facing documentation
├── CLAUDE.md                 # Claude configuration
├── GEMINI.md                 # Gemini CLI integration
├── README.md                 # This file
└── LICENSE                   # Apache-2.0
```

## Templates for Forking

When you fork this repository, you can copy the templates to set up Claude Code skills for your project:

```bash
# Copy skill templates to your project
cp -r templates/skills/* .claude/skills/

# Or copy specific skills
cp templates/skills/dev.md .claude/skills/
cp templates/skills/help.md .claude/skills/
cp templates/skills/gitrules.md .claude/skills/
```

| Template                                                     | Description                                  |
| ------------------------------------------------------------ | -------------------------------------------- |
| [templates/CLAUDE.md](templates/CLAUDE.md)                   | Project context template for Convex projects |
| [templates/skills/dev.md](templates/skills/dev.md)           | Full-stack development practices             |
| [templates/skills/help.md](templates/skills/help.md)         | Problem-solving methodology                  |
| [templates/skills/gitrules.md](templates/skills/gitrules.md) | Git safety protocols                         |

See [templates/skills/README.md](templates/skills/README.md) for detailed installation instructions.

## Skill Format

Each skill follows the Agent Skills specification:

```markdown
---
name: Skill Name
description: Brief description
version: 1.0.0
author: Convex
tags: [convex, ...]
---

# Skill Name

## Documentation Sources

## Instructions

## Examples

## Best Practices

## References
```

## Usage

Skills are automatically available once installed. The agent will use them when relevant tasks are detected.

**Examples:**

```
Help me set up file uploads in Convex
```

```
Create a cron job to clean up expired sessions
```

```
Add a webhook endpoint for Stripe
```

## Creating New Skills

Skills follow the Agent Skills specification. Each skill requires a `SKILL.md` file with YAML frontmatter.

### Skill Template

Create a new directory under `skills/`:

```
skills/my-skill/
└── SKILL.md
```

**SKILL.md format:**

```markdown
---
name: my-skill
description: A clear description of what this skill does
version: 1.0.0
author: Convex
tags: [convex, relevant-tags]
---

# My Skill Name

## Documentation Sources

Links to official documentation

## Instructions

Step-by-step guidance for the agent

## Examples

Concrete examples showing expected code patterns

## Best Practices

Specific rules to follow

## References

Additional resources
```

## Skill Versioning

Skills maintain two important metadata fields in their frontmatter:

### Version Field

The `version` field should **always match the Convex library version** the skill was tested against and updated for. This ensures compatibility with the Convex APIs referenced in the skill content.

- When updating skill content to reflect new Convex APIs or changes, update the `version` to the corresponding Convex release
- Example: If updating skills for Convex v1.40.0 features, set `version: 1.40.0`
- Check current Convex version: `npm view convex version`

### Last-Updated Field

The `last-updated` field tracks when the skill's **instructional content** was last reviewed or modified, in ISO 8601 format (YYYY-MM-DD).

- Update this field whenever you modify the skill's instructions, examples, or best practices
- Content updates that don't involve Convex API changes shouldn't require a version bump
- Use today's date: `last-updated: 2026-05-05`

### Keeping Them in Sync

When updating a skill to cover a new Convex release, update both fields:

```yaml
---
name: my-skill
version: 1.40.0        # Convex version this skill targets
last-updated: 2026-05-05  # Date of content update
---
```

This makes it easy to see at a glance which skills have been updated for which Convex versions.

## AI Integration Files

- `AGENTS.md` - Agent-facing documentation
- `CLAUDE.md` - Claude configuration for Convex projects
- `GEMINI.md` - Gemini CLI integration for Convex projects

## License

Apache-2.0 License - see [LICENSE](LICENSE) for details.

## References

- [npm Package](https://www.npmjs.com/package/@waynesutton/convex-skills)
- [Convex Documentation](https://docs.convex.dev/)
- [Convex LLMs.txt](https://docs.convex.dev/llms.txt)
- [Agent Skills Specification](https://github.com/anthropics/skills)
