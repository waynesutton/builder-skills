---
name: convex-migrations
description: "Changes a live Convex schema without downtime: make a field optional, backfill in batches, flip the validator, then clean up. Uses the @convex-dev/migrations component where it fits. Use when renaming or removing a field, changing a type, splitting a table, or when deploy fails with a schema validation error on existing documents."
---

# Convex migrations

Produces a schema change plus a batched backfill that keeps every deploy green. The one rule: the schema must describe the documents that exist right now, not the documents you want. Change the data first, then tighten the validator.

Convex has no migration files or `migrate` command. `npx convex dev` pushes the schema and validates every existing document against it. Existing data is never transformed for you.

## When to reach for this

- Adding a field that should be required, but the table already has rows
- Renaming a field, changing its type, or removing it
- Splitting one table into two or merging two into one
- `npx convex dev` fails with `Schema validation failed` after a schema edit
- A backfill needs to touch more rows than one mutation can handle

For step by step recipes (rename, change type, split, merge, add required, remove) open [references/migration-patterns.md](references/migration-patterns.md). For installing and running `@convex-dev/migrations` open [references/migrations-component.md](references/migrations-component.md).

## The safe sequence

Every migration follows the same six steps. Skipping one is how deploys break.

1. Make the field optional in `convex/schema.ts` (or add the new field as `v.optional`).
2. Deploy with `npx convex dev`. Update readers to handle `undefined` and writers to set the new shape.
3. Backfill existing documents in batches with an internal mutation or the migrations component.
4. Flip the validator to its final shape (`v.string()` instead of `v.optional(v.string())`, or drop the old field).
5. Deploy again. Validation now passes because every document already matches.
6. Clean up: delete fallback code, remove the backfill function, drop stale indexes.

Steps 1 and 2 must ship before step 3 starts. Otherwise new writes keep producing old shaped documents while the backfill runs.

## Hand rolled batched backfill

One `internalMutation` that pages through the table with `paginate`, patches only documents that still need it, then reschedules itself with the continue cursor. Each batch is its own transaction, so a large table never hits the per function limit.

```typescript
// convex/migrations.ts
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const BATCH_SIZE = 100;

export const backfillAvatarUrl = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("users")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor });

    for (const user of result.page) {
      // Idempotent: skip documents that already have the field
      if (user.avatarUrl === undefined) {
        await ctx.db.patch(user._id, {
          avatarUrl: defaultAvatar(user.name),
        });
      }
    }

    // Reschedule with the cursor until the table is exhausted
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillAvatarUrl, {
        cursor: result.continueCursor,
      });
    }
    return null;
  },
});

function defaultAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
}
```

Start it from the CLI against the dev deployment:

```bash
npx convex run migrations:backfillAvatarUrl '{"cursor": null}'
```

Keep the mutation idempotent. Re running it after a partial failure must be safe. Use `internalMutation`, never a public `mutation`, so it cannot be called from a client. Use `ctx.db.patch` for adding or changing fields and `ctx.db.patch(id, { field: undefined })` to remove one.

## When to use the component instead

`@convex-dev/migrations` wraps the pattern above and adds what the hand rolled version lacks: persisted progress per migration, status checks, dry runs, cancel, and ordered runs of several migrations. Reach for it when:

- The project will run more than one or two migrations over its life
- You need to know whether a migration already completed in production
- You want a dry run before touching real data
- Several migrations must run in a fixed order

Minimal setup:

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import migrations from "@convex-dev/migrations/convex.config.js";

const app = defineApp();
app.use(migrations);
export default app;
```

```typescript
// convex/migrations.ts
import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";

export const migrations = new Migrations<DataModel>(components.migrations);

export const addDefaultRole = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    if (user.role === undefined) {
      await ctx.db.patch(user._id, { role: "user" });
    }
  },
});
```

```bash
npx convex run migrations:addDefaultRole '{"dryRun": true}'
npx convex run migrations:addDefaultRole
```

A one off backfill on a small table does not need the component. The hand rolled mutation is fine.

## Reading the deploy time schema error

When a schema push fails, `npx convex dev` prints the table, one offending document id, and the field that does not match:

```
Schema validation failed
Document with ID "j57abc..." in table "users" does not match the schema:
Object is missing the required field `avatarUrl`.
Consider wrapping the field validator in `v.optional(...)` if this is expected.
```

Read it as: existing data in `users` predates the field. The fix is never to delete the document. Wrap the field in `v.optional`, deploy, backfill, then remove the `v.optional`. If the error says the field has the wrong type (for example `string` where `number` is expected), widen the validator to `v.union(v.string(), v.number())`, backfill the conversion, then narrow it.

Do not pass `{ schemaValidation: false }` to `defineSchema` to make the push succeed. It hides the mismatch and moves the failure into your queries.

## Common mistakes

| Mistake | Why it breaks | Do instead |
| --- | --- | --- |
| Add a required field in one deploy | Existing documents fail validation, push is rejected | Add as `v.optional`, backfill, then require |
| Start the backfill before deploying the new writers | New rows keep arriving in the old shape | Deploy schema and code first, backfill second |
| One mutation that `.collect()`s the whole table | Hits the transaction size and time limits | Page with `paginate` and reschedule per batch |
| Backfill with a public `mutation` | Anyone can call it and re run it | `internalMutation` or `migrations.define` |
| Non idempotent patch | Re running after a failure double applies | Check the field before patching |
| Removing the old field before readers stop using it | Fallback code reads `undefined` | Switch readers, then remove |
| Using `.filter()` to find unmigrated rows | Full scan on every batch | Paginate the whole table or use `customRange` with an index |
| Turning off `schemaValidation` to pass the deploy | Bad data reaches queries at runtime | Fix the data, keep validation on |
| Running a backfill against production first | No way to catch a wrong conversion | Run on dev, then `--prod` |

## Checklist

- [ ] New or changed field is `v.optional` (or a widened `v.union`) in the first deploy
- [ ] Readers handle `undefined` and writers produce the new shape before the backfill starts
- [ ] Backfill is an `internalMutation` or `migrations.define`, never public
- [ ] Backfill pages with `paginate` and reschedules via `ctx.scheduler.runAfter(0, internal....)`
- [ ] Each patch is guarded so re running is safe
- [ ] Backfill ran to completion on dev before touching prod
- [ ] Validator flipped to its final shape and deployed without a validation error
- [ ] Fallback code, old field, and backfill function removed
- [ ] Indexes that referenced the old field are dropped or renamed

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/database/schemas
- https://docs.convex.dev/database/pagination
- https://www.convex.dev/components/migrations
- https://stack.convex.dev/migrating-data-with-mutations
