---
name: convex-security-audit
description: "Retired. Points to the skill that replaced convex-security-audit in builder-skills 3.0. Use when /convex-security-audit is invoked by name or the user asks where convex-security-audit went."
---

# convex-security-audit (retired)

This skill moved. Use `sec-check` (in builder-skills) and `convex-authz` (official Convex) instead. Tell the user this, then load the replacement if it is installed.

Install the replacement:

```bash
npx builder-skills add sec-check
npx skills add convex/agent-skills --skill convex-authz
```

Or set up Convex for your agent in one step: read and follow https://www.convex.dev/agent-setup.md.

Old content: https://github.com/waynesutton/builder-skills/tree/82d1ce2/skills/convex-security-audit. Delete this folder after you switch.
