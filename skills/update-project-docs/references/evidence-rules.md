# Evidence rules

What counts as proof that something shipped, and how strong each kind is.

## Strong evidence

Use these freely.

| Source | Command | Shows |
| --- | --- | --- |
| Commit history | `git log --date=short --pretty='%ad %h %s' -n 20` | What landed and when |
| Changed files per commit | `git show --stat <sha>` | Which files a change touched |
| Staged changes | `git diff --cached --stat` | What is about to be committed |
| Working tree changes | `git diff --stat` and `git status --short` | What changed since the last commit |
| Version bump | `git log -p -n 5 -- package.json` | When a version heading should be dated |
| Source content | reading the file | What a feature does |

## Weak evidence

Use with a hedge in the entry.

| Source | Why it is weak |
| --- | --- |
| File modification times without git | Copies and checkouts reset them |
| Dependency in `package.json` | Installed is not used |
| A PRD or plan | Plans describe intent, not what shipped |
| The conversation | Memory of what was discussed drifts from what was written |
| Commit message alone | Messages lie. Check the stat. |

## Not evidence

- Generated files (`_generated/`, lockfiles, build output). Do not count these as progress.
- Formatting only commits.
- Files in `node_modules`.
- Anything read from an environment file.

## Deriving facts

- Project name: `package.json` name, then README title, then folder name.
- Repository URL: `git remote get-url origin`, converted to https.
- Release date: the commit that changed the version in `package.json`. If uncommitted, today in UTC.
- Author of a change: not needed in changelog or files.md. Leave it out.

## Idempotency check

Before writing, compare:

- latest commit sha in git vs the last sha or date mentioned in `changelog.md`
- `git status --short` output vs items already In Progress in `task.md`
- files in the diff vs files already described in `files.md`

If all three match, the docs are current. Do not touch them. Report "already current".

## When evidence conflicts with a doc

The doc says X shipped. The code does not show X.

1. Keep the evidence based value.
2. Fix the doc line.
3. Tell the user in one line: "changelog said cron cleanup shipped in 1.2.0, no crons.ts exists, removed the line."

Do not silently rewrite. Do not leave the wrong claim in place.
