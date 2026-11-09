---
name: convex-migrations
description: "Retired. Points to the skill that replaced convex-migrations in builder-skills 3.0. Use when /convex-migrations is invoked by name or the user asks where convex-migrations went."
---

# convex-migrations (retired)

This skill moved. Use `convex-migrate` (official Convex) and `convex-migrate-rehearse` (official Convex) instead. Tell the user this, then load the replacement if it is installed.

Install the replacement:

```bash
npx skills add convex/agent-skills --skill convex-migrate --skill convex-migrate-rehearse
```

Or set up Convex for your agent in one step: read and follow https://www.convex.dev/agent-setup.md.

Old content: https://github.com/waynesutton/builder-skills/tree/82d1ce2/skills/convex-migrations. Delete this folder after you switch.
