---
name: convex-migrations
displayName: Convex Migrations
description: Schema migration strategies for evolving Convex applications including adding fields, backfilling data, removing deprecated fields, index migrations, and zero-downtime patterns
version: 1.37.0
author: Convex
tags: [convex, migrations, schema, database, data-modeling]
last-updated: 2026-05-04
---

# Convex Migrations

Evolve your Convex database schema safely with patterns for adding fields, backfilling data, removing deprecated fields, and maintaining zero-downtime deployments.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/database/schemas
- Schema Philosophy: https://docs.convex.dev/database/advanced/schema-philosophy
- For broader context: https://docs.convex.dev/llms.txt

## Gotchas

Read this before any migration:

- **Schema validation is automatic**: The first push after adding/modifying a schema validates ALL existing documents. If validation fails, the push fails.
- **Convex is implicitly typed**: Even without `schema.ts`, Convex tracks field types automatically. Type changes create unions like `v.union(v.string(), v.number())`.
- **Circular references require nullable fields**: You cannot create circular ID references (user → preferences → user) unless one side is nullable.
- **`npx convex dev` deploys instantly**: Schema changes deploy immediately - no separate migration step.
- **Data is NOT transformed automatically**: Changing schema doesn't transform existing data. You must backfill explicitly.
- **Optional fields first**: Always make new fields optional initially. Making them required immediately breaks existing documents.
- **Indexes are built on deploy**: Adding an index to schema builds it immediately. Deploy before using in queries.
- **`schemaValidation: false` disables runtime checks**: You'll still get types, but no validation. Use cautiously for rapid prototyping.

## Migration Philosophy

Convex handles schema evolution differently than traditional databases:

- No explicit migration files or commands
- Schema changes deploy instantly with `npx convex dev`
- Existing data is not automatically transformed
- Use optional fields and backfill mutations for safe migrations
- Formalize schema when ready, but Convex tracks types implicitly

**Key insight**: Convex is always typed. Start without schema for prototyping, then formalize. The dashboard shows inferred schemas to help you understand your data.

## Core Migration Patterns

### Adding New Fields

**Step 1: Add optional field to schema**

```typescript
// convex/schema.ts
export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    // New field - start as optional
    avatarUrl: v.optional(v.string()),
  }),
});
```

**Step 2: Update code to handle both cases**

```typescript
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      // Handle missing field gracefully
      avatarUrl: user.avatarUrl ?? null,
    };
  },
});
```

**Step 3: Backfill existing documents** (see "Backfilling Pattern" below)

**Step 4: Make field required** (after backfill completes)

```typescript
export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.string(), // Now required
  }),
});
```

### Removing Fields

**Step 1: Stop using the field in queries and mutations**

Mark as deprecated in code comments.

**Step 2: Remove field from schema** (make optional first if needed)

```typescript
export default defineSchema({
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    authorId: v.id("users"),
    // legacyField removed
  }),
});
```

**Step 3: Optionally clean up existing data** (use `db.replace` to remove field entirely)

### Renaming Fields

Renaming is a copy-then-remove operation:

1. Add new field as optional
2. Update code to read new field with fallback to old
3. Backfill to copy data from old to new field
4. Update schema to make new field required
5. Remove old field from schema and code

### Changing Field Types

Type changes require a transition period with both fields:

1. Add new field with new type as optional
2. Backfill with type conversion logic
3. Update code to use new field with fallback
4. After migration, remove old field and make new required

### Adding Indexes

Add indexes before using them:

```typescript
// Step 1: Add index to schema
export default defineSchema({
  posts: defineTable({
    title: v.string(),
    authorId: v.id("users"),
    publishedAt: v.optional(v.number()),
    status: v.string(),
  })
  .index("by_author", ["authorId"])
  .index("by_status_and_published", ["status", "publishedAt"]),
});

// Step 2: Deploy schema (npx convex dev) - index builds automatically

// Step 3: Now use the index in queries
```

### Handling Circular References

Circular ID references require one side to be nullable:

```typescript
export default defineSchema({
  users: defineTable({
    preferencesId: v.id("preferences"),
  }),
  preferences: defineTable({
    // Make nullable to break the circular reference
    userId: v.union(v.id("users"), v.null()),
  }),
});
```

Insertion sequence:
1. Create preferences document (userId: null)
2. Create user document (preferencesId: ...)
3. Update preferences document (userId: ...)

## Backfilling Pattern

Use this pattern for safe, resumable backfills:

```typescript
// convex/migrations/backfillAvatarUrl.ts
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const MIGRATION_NAME = "backfill_avatar_url_v1";
const BATCH_SIZE = 100;

export const run = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    processed: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("users")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let processed = 0;
    for (const user of result.page) {
      // Only update if field is missing
      if (user.avatarUrl === undefined) {
        await ctx.db.patch(user._id, {
          avatarUrl: generateDefaultAvatar(user.name),
        });
        processed++;
      }
    }

    // Schedule next batch if needed
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillAvatarUrl.run, {
        cursor: result.continueCursor,
      });
    }

    return {
      processed,
      hasMore: !result.isDone,
    };
  },
});

function generateDefaultAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
}
```

**Validation**: After backfill completes, verify no undefined values remain:

```typescript
export const validateBackfill = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const usersWithoutAvatar = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("avatarUrl"), undefined))
      .collect();
    return usersWithoutAvatar.length;
  },
});
```

## Schema Options

### Disable Schema Validation

Use for rapid prototyping (NOT production):

```typescript
export default defineSchema(
  {
    // tables
  },
  {
    schemaValidation: false, // No runtime validation, still get types
  }
);
```

### Flexible Table Names

Allow tables not in schema for experimentation:

```typescript
export default defineSchema(
  {
    // partial schema
  },
  {
    strictTableNameTypes: false, // Allow accessing undefined tables (type: any)
  }
);
```

**Warning**: These options are for development only. Enable both in production.

## Zero-Downtime Migration Workflow

1. **Prepare phase** (dev):
   - Read schema references in `references/schema.yaml`
   - Add new optional fields to schema
   - Write backfill migration with error handling
   - Update code to handle both old and new data
   - Test thoroughly with `convex test`

2. **Deploy phase** (dev → prod):
   - Deploy schema change to production
   - Schema validates automatically (first push)
   - If validation fails, rollback and fix

3. **Backfill phase** (prod):
   - Run backfill migration in batches
   - Monitor for errors
   - Validate completion with query

4. **Cleanup phase** (prod):
   - Make fields required in schema
   - Remove deprecated fields
   - Update code to only use new schema
   - Deploy final changes

## Validation Checklist

Before and after migrations:

**Pre-migration:**
- [ ] Schema validation enabled (dev: yes, prod: yes)
- [ ] New fields marked optional
- [ ] Code handles undefined values
- [ ] Backfill migration written and tested
- [ ] Database backup exists (if using external backup)

**Post-migration:**
- [ ] Backfill completed successfully (query confirms)
- [ ] No validation errors in logs
- [ ] All functions use new schema correctly
- [ ] Performance tests pass
- [ ] Deprecated fields removed from code

## Common Migration Pitfalls

1. **Making fields required immediately** - Breaks existing documents without backfill
2. **Not handling undefined values** - Runtime errors in queries/mutations
3. **Large batch sizes** - Function timeouts (> 4GB seconds or 16MB output)
4. **Forgetting indexes** - Slow queries on new fields
5. **Running backfills without tracking** - May run multiple times idempotently
6. **Removing fields before code update** - Breaks existing functionality
7. **Not testing in dev first** - Production data corruption risk
8. **Circular references without nullable** - Cannot create documents due to validation

## Progressive Disclosure

For detailed examples and advanced patterns, load references as needed:

- **Full migration runner with tracking**: Read `references/migration-runner.md` when you need production-grade migration management
- **Search and vector indexes**: Read `references/index-migrations.md` when adding search or vector search capabilities
- **Complex type changes**: Read `references/type-migrations.md` for union handling and record type migrations
- **Multi-table migrations**: Read `references/relational-migrations.md` for migrations involving foreign keys and relationships

## Additional Validators

### Record Objects (dynamic keys)

```typescript
defineTable({
  metadata: v.record(v.string(), v.any()),
});
```

### Any Type

```typescript
defineTable({
  flexibleField: v.any(),
});
```

### Literals and Unions

```typescript
defineTable({
  status: v.union(
    v.literal("draft"),
    v.literal("published"),
    v.literal("archived")
  ),
});
```

## References

- Convex Schemas: https://docs.convex.dev/database/schemas
- Schema Philosophy: https://docs.convex.dev/database/advanced/schema-philosophy
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Data Types: https://docs.convex.dev/database/types
- Database Overview: https://docs.convex.dev/database
