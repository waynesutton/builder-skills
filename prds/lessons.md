# Lessons

One line per lesson. Newest at the bottom. Read this at the start of every session in this repo.

- 2026-02-02 Skill frontmatter with keys beyond `name` and `description` breaks some parsers (Pi). Keep to the two keys.
- 2026-01-23 The `name` field must match the folder name or slash commands stop resolving.
- 2026-09-16 The CLI `SKILLS` map, `index.js`, and `plugin.json` drifted from the `skills/` folder (12 vs 14). A check script that compares all four is cheaper than remembering.
- 2026-09-16 Claude Code stopped reading flat `.md` files in a skills folder. Every skill, including templates, is a folder with `SKILL.md`.
- 2026-09-16 Naming a personal package after the platform reads as official once the platform ships its own. Name it after who it is for.
- 2026-09-16 An old name gate needs an allowlist for files that document the rename itself (`changelog.md`, `prds/`, and the `npm deprecate` step in `task.md`). Otherwise the gate blocks the migration notes.
- 2026-11-09 A hand written frontmatter parser passed values that strict YAML rejects. `npx skills add` silently dropped 10 of 17 skills for weeks. Lint with the strict parser's rules (quote anything with `: `), and test with the real installer (`npx skills add <local copy> --list`).
- 2026-11-09 Before deleting a popular skill, check how installers record it. skills.sh locks `skillPath` plus a hash, so a stub at the same path reaches existing installs on `npx skills update`. A deleted path reaches no one.
- 2026-11-09 A skill named `help` cannot be called as `/help` in Claude Code, because the built-in wins. Check slash command names against built-ins.
- 2026-11-09 npm skips symlinks, so `CLAUDE.md -> AGENTS.md` never shipped in the package even though `files` listed it. Check `npm pack --dry-run`, not the `files` list.
