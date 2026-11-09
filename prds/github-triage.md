# GitHub triage for 3.0

Created: 2026-11-09 07:40 UTC
Status: Draft. Waiting for owner approval. Post only after the 3.0 commit is pushed to `main`, since the comments link to the new README and MIGRATING.md.

Each item has the comment text and the exact command. Nothing here has been run.

## #11 skills CLI skips 10 of 17 skills (close, completed)

> Fixed by #12, thanks @cgalo for the clear repro and the PR. `npm run check` now fails on any unquoted frontmatter value with `: ` in it, so this can't come back quietly. Verified with `npx skills add` against the 3.0 tree: every skill is found, none skipped.

```bash
gh issue close 11 -R waynesutton/builder-skills --reason completed --comment "Fixed by #12, thanks @cgalo for the clear repro and the PR. \`npm run check\` now fails on any unquoted frontmatter value with \`: \` in it, so this can't come back quietly. Verified with \`npx skills add\` against the 3.0 tree: every skill is found, none skipped."
```

## #8 Advantage of your alternative over official skills (close, completed)

> Good question, and you're right to default to the official ones. Convex knows Convex best. As of 3.0, the Convex API skills here are retired and point to the official set (https://github.com/convex/agent-skills, or tell your agent to read https://www.convex.dev/agent-setup.md). This repo now covers the work around Convex: PRDs, task tracking, docs synced from git, git safety, a security check, and a writing guide. The README explains it: https://github.com/waynesutton/builder-skills#why-this-exists-next-to-the-official-convex-skills

```bash
gh issue close 8 -R waynesutton/builder-skills --reason completed --comment "Good question, and you're right to default to the official ones. Convex knows Convex best. As of 3.0, the Convex API skills here are retired and point to the official set (https://github.com/convex/agent-skills, or tell your agent to read https://www.convex.dev/agent-setup.md). This repo now covers the work around Convex: PRDs, task tracking, docs synced from git, git safety, a security check, and a writing guide. The README explains it: https://github.com/waynesutton/builder-skills#why-this-exists-next-to-the-official-convex-skills"
```

## #4 Potential overlap between Convex skills (close, completed)

> Thanks for the careful write up, and sorry this sat so long. You were right about the overlap. 3.0 retires all the Convex API skills in favor of the official Convex set, so the functions / http actions / schema / migrations / security overlap is gone. Security is now one skill, `sec-check`, with a quick mode and a full audit mode. The old to new map is here: https://github.com/waynesutton/builder-skills/blob/main/MIGRATING.md

```bash
gh issue close 4 -R waynesutton/builder-skills --reason completed --comment "Thanks for the careful write up, and sorry this sat so long. You were right about the overlap. 3.0 retires all the Convex API skills in favor of the official Convex set, so the functions / http actions / schema / migrations / security overlap is gone. Security is now one skill, \`sec-check\`, with a quick mode and a full audit mode. The old to new map is here: https://github.com/waynesutton/builder-skills/blob/main/MIGRATING.md"
```

## PR #10 Update all Convex skills to version 1.37.0 (close)

> Thank you for putting this together. In 3.0 the Convex API skills moved to the official Convex set (https://github.com/convex/agent-skills), so there is nothing left here for these updates to land on. One note for anyone reading later: extra frontmatter fields like `last-updated` break some skill parsers (see #7), so this repo keeps frontmatter to `name` and `description`. Closing, with thanks.

```bash
gh pr close 10 -R waynesutton/builder-skills --comment "Thank you for putting this together. In 3.0 the Convex API skills moved to the official Convex set (https://github.com/convex/agent-skills), so there is nothing left here for these updates to land on. One note for anyone reading later: extra frontmatter fields like \`last-updated\` break some skill parsers (see #7), so this repo keeps frontmatter to \`name\` and \`description\`. Closing, with thanks."
```

## PR #9 Consolidate discrete skills into a single convex skill (close)

> Thanks for this. You were pointing the right way. 3.0 goes one step further: the Convex skills are retired and point to the official Convex set, which now does the one-entry-point routing you built here. Closing since the files it touches are gone.

```bash
gh pr close 9 -R waynesutton/builder-skills --comment "Thanks for this. You were pointing the right way. 3.0 goes one step further: the Convex skills are retired and point to the official Convex set, which now does the one-entry-point routing you built here. Closing since the files it touches are gone."
```

## PR #6 Add AdaL to compatible agents (close)

> Thanks for the PR. The README now says the skills work with any agent that reads `SKILL.md` instead of listing agents one by one, so I'm closing this one. Glad it works in AdaL.

```bash
gh pr close 6 -R waynesutton/builder-skills --comment "Thanks for the PR. The README now says the skills work with any agent that reads \`SKILL.md\` instead of listing agents one by one, so I'm closing this one. Glad it works in AdaL."
```

## Repo description and topics

```bash
gh repo edit waynesutton/builder-skills \
  --description "Workflow, security, and writing skills for builders shipping Convex apps. npx builder-skills" \
  --add-topic agent-skills --add-topic claude-code --add-topic codex --add-topic cursor --add-topic opencode \
  --add-topic prd --add-topic security --add-topic convex
```

## No new issues needed

Pending work is tracked in `task.md`: npm publish, deprecating the old package, the skills.sh refresh install, the `skills update` stub check, and removing the stubs in 4.0. Nothing needs a public issue.
