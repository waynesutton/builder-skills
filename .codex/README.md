# Codex integration

Codex discovers skills from `.codex/skills` at the repo root. This folder holds one symlink per active skill, pointing at `../../skills/<name>`, so the source of truth stays in `skills/`. Retired stubs are not linked.

## In another project

```bash
npx builder-skills add --all --target codex
```

Or link instead of copy so updates flow through:

```bash
npx builder-skills add --all --target codex --link
```

## Global install

```bash
# CODEX_HOME defaults to ~/.codex
npx builder-skills add --all --target "$CODEX_HOME/skills"
```

## Skills

Each active skill has a `SKILL.md`, an `agents/openai.yaml` with icon metadata, and, where needed, a `references/` folder the skill loads on demand (`sec-check` also ships `scripts/`). The list lives in `skills/manifest.json`. Run `npx builder-skills list` or see the main [README](../README.md).
