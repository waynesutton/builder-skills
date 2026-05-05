---
name: convex-schema-validator
displayName: Convex Schema Validator
description: Defining and validating database schemas with proper typing, index configuration, optional fields, unions, and migration strategies for schema changes
version: 1.37.0
author: Convex
tags: [convex, schema, validation, typescript, indexes, migrations]
last-updated: 2026-05-04
---

# Convex Schema Validator

Define and validate database schemas in Convex with proper typing, index configuration, optional fields, unions, and strategies for schema migrations.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/database/schemas
- Schema Philosophy: https://docs.convex.dev/database/advanced/schema-philosophy
- Indexes: https://docs.convex.dev/database/reading-data/indexes
- Data Types: https://docs.convex.dev/database/types
- For broader context: https://docs.convex.dev/llms.txt

## Instructions

### Basic Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
  }),
  
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    completed: v.boolean(),
    userId: v.id("users"),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
  }),
});
```

### Validator Types

| Validator | TypeScript Type | Example |
|-----------|----------------|---------|
| `v.string()` | `string` | `"hello"` |
| `v.number()` | `number` | `42`, `3.14` |
| `v.boolean()` | `boolean` | `true`, `false` |
| `v.null()` | `null` | `null` |
| `v.int64()` | `bigint` | `9007199254740993n` |
| `v.bytes()` | `ArrayBuffer` | Binary data |
| `v.id("table")` | `Id<"table">` | Document reference |
| `v.array(v)` | `T[]` | `[1, 2, 3]` (max 8192 elements) |
| `v.object({})` | `{ ... }` | `{ name: "..." }` (max 1024 fields) |
| `v.optional(v)` | `T \| undefined` | Optional field |
| `v.union(...)` | `T1 \| T2` | Multiple types |
| `v.literal(x)` | `"x"` | Exact value |
| `v.any()` | `any` | Any value |
| `v.record(k, v)` | `Record<K, V>` | Dynamic keys (ASCII keys only) |

### Index Configuration

```typescript
export default defineSchema({
  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.id("users"),
    content: v.string(),
    sentAt: v.number(),
  })
    // Single field index (simple syntax)
    .index("by_channel", ["channelId"])
    // Compound index
    .index("by_channel_and_author", ["channelId", "authorId"])
    // Index for sorting
    .index("by_channel_and_time", ["channelId", "sentAt"])
    // Staged index for large tables (async creation)
    .index("by_author_and_content", { fields: ["authorId", "content"], staged: true }),
    
  // Full-text search index
  articles: defineTable({
    title: v.string(),
    body: v.string(),
    category: v.string(),
  })
    .searchIndex("search_content", {
      searchField: "body",
      filterFields: ["category"],
    }),
});
```

#### Index Limits

- Maximum 16 fields per index
- Maximum 32 indexes per table
- Indexes cannot contain duplicate fields
- No reserved fields (starting with `_`) allowed in indexes
- `_creationTime` is automatically added to the end of every index (counts towards the limit)
- `by_creation_time` index is created automatically
- `by_id` index is reserved

#### Staged Indexes

For large tables, use staged indexes to create them asynchronously without blocking deploy:

```typescript
// Step 1: Create as staged
export default defineSchema({
  messages: defineTable({
    channel: v.id("channels"),
  }).index("by_channel", { fields: ["channel"], staged: true }),
});

// Step 2: After backfill completes (check dashboard), enable by removing staged option
export default defineSchema({
  messages: defineTable({
    channel: v.id("channels"),
  }).index("by_channel", { fields: ["channel"] }),
});
```

Staged indexes cannot be used in queries until enabled. Monitor backfill progress via the Indexes pane on the dashboard.

#### Sorting with Indexes

Queries using `withIndex` are ordered by the index fields. Use `.order("desc")` for descending order:

```typescript
// Get top 10 highest scoring players
const topScoringPlayers = await ctx.db
  .query("players")
  .withIndex("by_score")
  .order("desc")
  .take(10);
```

### Schema Options

Configure schema behavior with options passed to `defineSchema`:

```typescript
export default defineSchema(
  {
    // Define tables here
  },
  {
    // Disable runtime validation (default: true)
    schemaValidation: false,

    // Allow TypeScript access to tables not in schema (default: true)
    strictTableNameTypes: false,
  }
);
```

**schemaValidation**: When disabled, Convex will not validate that new or existing documents match your schema. You'll still get TypeScript types, but no runtime validation.

**strictTableNameTypes**: When disabled, TypeScript types allow access to tables not listed in schema (document type will be `any`). Regardless, schema only validates documents in listed tables.

### Circular References

Circular ID references require one reference to be nullable to allow creation:

```typescript
// ❌ Cannot create - validation prevents circular inserts
export default defineSchema({
  users: defineTable({
    preferencesId: v.id("preferences"),
  }),
  preferences: defineTable({
    userId: v.id("users"),
  }),
});

// ✅ Make one reference nullable
export default defineSchema({
  users: defineTable({
    preferencesId: v.id("preferences"),
  }),
  preferences: defineTable({
    userId: v.union(v.id("users"), v.null()),
  }),
});

// Create pattern:
// 1. Create preferences first (userId is null)
// 2. Create user with preferencesId
// 3. Update preferences with userId
```

### Complex Types

```typescript
export default defineSchema({
  // Nested objects
  profiles: defineTable({
    userId: v.id("users"),
    settings: v.object({
      theme: v.union(v.literal("light"), v.literal("dark")),
      notifications: v.object({
        email: v.boolean(),
        push: v.boolean(),
      }),
    }),
  }),

  // Arrays of objects
  orders: defineTable({
    customerId: v.id("users"),
    items: v.array(v.object({
      productId: v.id("products"),
      quantity: v.number(),
      price: v.number(),
    })),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("shipped"),
      v.literal("delivered")
    ),
  }),

  // Record type for dynamic keys (keys must be ASCII characters, nonempty, not starting with "$" or "_")
  analytics: defineTable({
    date: v.string(),
    metrics: v.record(v.string(), v.number()),
  }),
});
```

### Discriminated Unions

```typescript
export default defineSchema({
  events: defineTable(
    v.union(
      v.object({
        type: v.literal("user_signup"),
        userId: v.id("users"),
        email: v.string(),
      }),
      v.object({
        type: v.literal("purchase"),
        userId: v.id("users"),
        orderId: v.id("orders"),
        amount: v.number(),
      }),
      v.object({
        type: v.literal("page_view"),
        sessionId: v.string(),
        path: v.string(),
      })
    )
  ).index("by_type", ["type"]),
});
```

### Optional vs Nullable Fields

```typescript
export default defineSchema({
  items: defineTable({
    // Optional: field may not exist
    description: v.optional(v.string()),

    // Nullable: field exists but can be null
    deletedAt: v.union(v.number(), v.null()),

    // Optional and nullable
    notes: v.optional(v.union(v.string(), v.null())),
  }),
});
```

### Working with `undefined`

`undefined` is not a valid Convex value and behaves specially:

- `{a: undefined}` becomes `{}` when stored (field is removed)
- `{a: undefined}` in `ctx.db.patch()` removes field "a" from the document
- `undefined` in filters/index queries matches documents without the field
- Order: `undefined < null < all other values`
- Functions returning `undefined`/`void` are treated as returning `null`

Prefer `null` over `undefined` to avoid special behaviors.

### Document Size Measurement

```typescript
import { getDocumentSize, getConvexSize } from "convex/values";

// Measure complete document size (includes system fields _id and _creationTime)
const bytes = getDocumentSize(doc);

// Measure any Convex value size
const arraySize = getConvexSize([true, 1n, null, "string", doc, buffer]);
```

All Convex values must be under 1MB total size, with maximum 16 levels of nesting.

### Index Naming Convention

Always include all indexed fields in the index name:

```typescript
export default defineSchema({
  posts: defineTable({
    authorId: v.id("users"),
    categoryId: v.id("categories"),
    publishedAt: v.number(),
    status: v.string(),
  })
    // Good: descriptive names
    .index("by_author", ["authorId"])
    .index("by_author_and_category", ["authorId", "categoryId"])
    .index("by_category_and_status", ["categoryId", "status"])
    .index("by_status_and_published", ["status", "publishedAt"]),
});
```

### Schema Migration Strategies

#### Adding New Fields

```typescript
// Before
users: defineTable({
  name: v.string(),
  email: v.string(),
})

// After - add as optional first
users: defineTable({
  name: v.string(),
  email: v.string(),
  avatarUrl: v.optional(v.string()), // New optional field
})
```

#### Backfilling Data

```typescript
// convex/migrations.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const backfillAvatars = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("avatarUrl"), undefined))
      .take(100);

    for (const user of users) {
      await ctx.db.patch(user._id, {
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`,
      });
    }

    return users.length;
  },
});
```

#### Making Optional Fields Required

```typescript
// Step 1: Backfill all null values
// Step 2: Update schema to required
users: defineTable({
  name: v.string(),
  email: v.string(),
  avatarUrl: v.string(), // Now required after backfill
})
```

## Examples

### Complete E-commerce Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("customer"), v.literal("admin")),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  products: defineTable({
    name: v.string(),
    description: v.string(),
    price: v.number(),
    category: v.string(),
    inventory: v.number(),
    isActive: v.boolean(),
  })
    .index("by_category", ["category"])
    .index("by_active_and_category", ["isActive", "category"])
    .searchIndex("search_products", {
      searchField: "name",
      filterFields: ["category", "isActive"],
    }),

  orders: defineTable({
    userId: v.id("users"),
    items: v.array(v.object({
      productId: v.id("products"),
      quantity: v.number(),
      priceAtPurchase: v.number(),
    })),
    total: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    shippingAddress: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      country: v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_status", ["status"]),

  reviews: defineTable({
    productId: v.id("products"),
    userId: v.id("users"),
    rating: v.number(),
    comment: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_user", ["userId"]),
});
```

### Using Schema Types in Functions

```typescript
// convex/products.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// Use Doc type for full documents
type Product = Doc<"products">;

// Use Id type for references
type ProductId = Id<"products">;

export const get = query({
  args: { productId: v.id("products") },
  returns: v.union(
    v.object({
      _id: v.id("products"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      price: v.number(),
      category: v.string(),
      inventory: v.number(),
      isActive: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<Product | null> => {
    return await ctx.db.get(args.productId);
  },
});
```

## Best Practices

- Never run `npx convex deploy` unless explicitly instructed
- Never run any git commands unless explicitly instructed
- Begin without a schema for rapid prototyping, then add once solidified
- Always define explicit schemas rather than relying on inference
- Use descriptive index names that include all indexed fields
- Start with optional fields when adding new columns
- Use discriminated unions for polymorphic data
- Validate data at the schema level, not just in functions
- Plan index strategy based on query patterns
- Use staged indexes for large tables to avoid blocking deploys
- Prefer `null` over `undefined` to avoid special behaviors
- Make circular references nullable to allow creation
- Monitor index backfill progress in dashboard before enabling staged indexes

## Common Pitfalls

1. **Missing indexes for queries** - Every withIndex needs a corresponding schema index
2. **Wrong index field order** - Fields must be queried in order defined
3. **Using v.any() excessively** - Lose type safety benefits
4. **Not making new fields optional** - Breaks existing data
5. **Forgetting system fields** - _id and _creationTime are automatic
6. **Circular references without nullable** - Cannot create documents with mutual ID references without making at least one nullable
7. **Using undefined in stored documents** - Fields with undefined values are removed; use null instead
8. **Non-ASCII keys in v.record()** - Record keys must be ASCII characters only
9. **Exceeding index limits** - Maximum 16 fields per index, 32 indexes per table
10. **Forgetting staged index backfill** - Cannot use staged indexes until backfill completes and staged option removed
11. **Using reserved field names** - Field names starting with "$" or "_" (except system fields) are not allowed
12. **Full table scans without limits** - Using withIndex without range expression + collect() scans entire table; use first(), unique(), take(), or paginate()

## References

- Convex Documentation: https://docs.convex.dev/
- Schemas: https://docs.convex.dev/database/schemas
- Schema Philosophy: https://docs.convex.dev/database/advanced/schema-philosophy
- Indexes: https://docs.convex.dev/database/reading-data/indexes
- Data Types: https://docs.convex.dev/database/types
- LLM-optimized: https://docs.convex.dev/llms.txt
