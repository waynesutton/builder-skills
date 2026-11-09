# Contributing to builder-skills

Thanks for helping. Small focused pull requests land fastest.

## Report a problem

Open a GitHub issue at https://github.com/waynesutton/builder-skills/issues with the skill name, what you asked the agent, and what it did instead. For anything sensitive, contact Wayne directly through https://waynesutton.ai.

## Submit a change

1. Fork and branch.
2. Make the change.
3. Run `npm run check`. It has to pass.
4. Open a pull request with a one paragraph summary and, for skill changes, a before and after prompt that shows the difference.

## Skill rules

Every skill in `skills/<name>/` follows the same shape.

- `SKILL.md` frontmatter has exactly two keys: `name` and `description`. `name` matches the folder.
- Quote the `description`. An unquoted value containing `: ` breaks strict YAML parsers, and `npm run check` fails on it.
- `description` is third person, says what the skill does, and ends with a `Use when ...` sentence. Under 1024 characters.
- `SKILL.md` body stays under 300 lines. Hard limit 500. Move deep material into `references/*.md` and link it from the body. References do not link to each other.
- Verify any Convex API you cite against https://docs.convex.dev/llms.txt. Convex API skills belong in the official set (https://github.com/convex/agent-skills), not here.
- No emojis. No em dashes. No marketing words. `npm run check` flags the common ones.

## Adding a skill

1. Create `skills/<name>/SKILL.md`, plus `agents/openai.yaml` and `assets/` (copy from a sibling skill).
2. Add an entry to `skills/manifest.json` with a group and a one line summary.
3. Add it to `.claude-plugin/plugin.json` and `skills.sh.json`, add a row to the README table, and add it to `docs.md`.
4. Run `ln -s ../../skills/<name> .codex/skills/<name>` so Codex finds it in this repo.
5. Run `npm run check`. It fails if any of those lists disagree with the manifest.

## Trying the CLI locally

```bash
node bin/cli.js                         # the picker
node bin/cli.js add --all --dir /tmp/try
node bin/cli.js list --json
```

## Commit messages

`type: short description` in present tense. Types: feat, fix, docs, chore.

## License

Contributions are licensed under Apache-2.0, same as the repo.
