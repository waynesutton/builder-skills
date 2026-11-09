#!/usr/bin/env node
// Final release of @waynesutton/convex-skills. Prints where everything went.
console.log(`
@waynesutton/convex-skills was renamed to @waynesutton/builder-skills.

  Workflow, security, and writing skills:  npx builder-skills
  Convex skills (now official):            npx skills add convex/agent-skills
  Set up Convex for your agent:            read https://www.convex.dev/agent-setup.md

Old to new map: https://github.com/waynesutton/builder-skills/blob/main/MIGRATING.md
`);
process.exitCode = 1;
