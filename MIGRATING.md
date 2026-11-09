# Migrating to builder-skills 3.0

Two things changed:

1. The npm package `@waynesutton/convex-skills` is now `@waynesutton/builder-skills`, and `npx builder-skills` works as a short name.
2. The Convex API skills moved to the official Convex set. builder-skills now ships workflow, security, and writing skills.

## If you use the skills

### From the old npm package

```bash
npm uninstall @waynesutton/convex-skills
npx builder-skills                      # pick skills and agents
```

### From skills.sh

```bash
npx skills update
```

Each retired `convex-*` skill updates to a short stub that names its replacement. Install the replacements, then delete the stub folders.

### Set up the official Convex skills

Tell your agent:

```
Read https://www.convex.dev/agent-setup.md and follow it.
```

Or install them directly:

```bash
npx skills add convex/agent-skills
```

### Old to new

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
| `help` template | `think-first` |
| `dev` template | `dev` skill |

To clean up old copies in a project:

```bash
npx builder-skills update     # refreshes builder skills, lists retired folders and their replacements
```

Then delete the retired folders it lists. `update` never deletes anything itself.

### CLI commands

| 2.x | 3.0 |
| --- | --- |
| `install <skill>` | `add <skill>` (`install` still works) |
| `install-all` | `add --all` (`install-all` still works) |
| `install-templates` | `init` (`install-templates` still works) |
| `--target opencode` wrote `.agents/skills` | now writes `.opencode/skills`. OpenCode reads both. |

## Owner steps: publishing 3.0

Run these from the repo root after the 3.0 commit is on `main`.

1. Log in. npm needs 2FA for publish.

   ```bash
   npm whoami || npm login
   ```

2. Check and preview the package.

   ```bash
   npm run check
   npm pack --dry-run
   ```

   Look for `skills/manifest.json`, `skills/sec-check/scripts/`, and `templates/SECURITY.md`. `prds/`, `packages/`, and `task.md` should not be in the list.

3. Publish the main package. This is the first publish under this name.

   ```bash
   npm publish --access public --otp <code>
   ```

4. Publish the short name. It depends on `@waynesutton/builder-skills@^3.0.0`, so it has to go second.

   ```bash
   cd packages/builder-skills
   npm publish --otp <code>
   cd ../..
   ```

   If npm rejects `builder-skills` as too close to an existing name, skip this step and change `npx builder-skills` to `npx @waynesutton/builder-skills` in the README.

5. Confirm both.

   ```bash
   npm view @waynesutton/builder-skills version
   npm view builder-skills version
   npx builder-skills list
   ```

6. Deprecate the old package. With no version range, this covers every version.

   ```bash
   npm deprecate @waynesutton/convex-skills "Renamed to @waynesutton/builder-skills (npx builder-skills). Convex skills moved to github.com/convex/agent-skills"
   ```

7. Optional: point the old npm page and `npx` at the new name. npm shows the README of the latest version, so a final release replaces the old README and makes `npx @waynesutton/convex-skills` print the move.

   ```bash
   cd scripts/legacy-package
   npm publish --access public --otp <code>
   cd ../..
   npm deprecate @waynesutton/convex-skills "Renamed to @waynesutton/builder-skills (npx builder-skills). Convex skills moved to github.com/convex/agent-skills"
   ```

   Run the deprecate again after this publish so 1.1.0 carries the notice too.

8. Refresh the skills.sh page. It reads `skills.sh.json` after an install with telemetry on.

   ```bash
   npx skills add waynesutton/builder-skills --skill write -y
   ```

   Then check https://www.skills.sh/waynesutton/builder-skills after the page cache refreshes.
