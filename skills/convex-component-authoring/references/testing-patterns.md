# Testing Patterns

Complete guide for testing Convex components.

## Test Helper Export

Most components export testing helpers to register the component with `convex-test`:

```typescript
/// <reference types="vite/client" />

import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import schema from "./component/schema.js";

const modules = import.meta.glob("./component/**/*.ts");

/**
 * Register the component with the test convex instance.
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 * @param name - The name of the component, as registered in convex.config.ts.
 */
export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = "myComponent",
) {
  t.registerComponent(name, schema, modules);
}

export default { register, schema, modules };
```

This is exposed as `@your/package/test` in the package's `package.json`:

```json
{
  "exports": {
    "./test": "./src/test.ts"
  }
}
```

## Testing Component Implementations

To test the component's internal functions and database interactions:

```typescript
// component/some.test.ts
import { test } from "vitest";
import { convexTest } from "convex-test";
import { register } from "@your/package/test";

test("Test component functionality", async () => {
  const t = convexTest({});
  register(t, "myComponent");

  await t.run(async (ctx) => {
    // Access the component's database directly
    await ctx.db.insert("items", { name: "test", data: {}, createdAt: Date.now() });

    // Test component functions using the internal API
    const result = await ctx.runQuery((ctx) => {
      // Call internal component functions directly
      return "test result";
    });
  });
});
```

## Testing Client Code and API

To test the functions exported to run in the app's environment, test from an app that uses the component. The template component includes an example app for this purpose - to exercise the component's bundled code as it will be used by apps installing it.

## Testing Workflow Checklist

Use this checklist when testing a component:

- [ ] Step 1: Create test file in `component/` directory
- [ ] Step 2: Import test helpers from `@your/package/test`
- [ ] Step 3: Register component with `convexTest`
- [ ] Step 4: Write test cases
- [ ] Step 5: Run tests
  ```bash
  npm test
  ```
- [ ] Step 6: Verify all tests pass
- [ ] Step 7: Test with example app (if applicable)
- [ ] Step 8: Verify component functions work end-to-end
  ```bash
  npx convex run --component myComponent hello:world
  ```

**If any test fails:**
1. Check error message
2. Review the test case logic
3. Fix the issue in component or test
4. Re-run tests
5. Only proceed when all tests pass

## Test Patterns

### Testing Database Operations

```typescript
test("Test database operations", async () => {
  const t = convexTest({});
  register(t, "myComponent");

  await t.run(async (ctx) => {
    // Insert data
    const id = await ctx.db.insert("items", {
      name: "test",
      data: {},
      createdAt: Date.now(),
    });

    // Query data
    const item = await ctx.db.get(id);
    expect(item?.name).toBe("test");

    // Update data
    await ctx.db.patch(id, { data: { updated: true } });

    // Delete data
    await ctx.db.delete(id);
  });
});
```

### Testing Component Functions

```typescript
test("Test component function", async () => {
  const t = convexTest({});
  register(t, "myComponent");

  await t.run(async (ctx) => {
    // Call component function directly (via internal API)
    const result = await ctx.runQuery((ctx) => {
      return "test result";
    });

    expect(result).toBe("test result");
  });
});
```

### Testing Edge Cases

```typescript
test("Test edge cases", async () => {
  const t = convexTest({});
  register(t, "myComponent");

  await t.run(async (ctx) => {
    // Test with empty data
    const empty = await ctx.db.query("items").collect();
    expect(empty).toHaveLength(0);

    // Test with large data
    const largeId = await ctx.db.insert("items", {
      name: "large",
      data: { array: Array(1000).fill("test") },
      createdAt: Date.now(),
    });

    // Test with special characters
    const specialId = await ctx.db.insert("items", {
      name: "special & < > \" '",
      data: {},
      createdAt: Date.now(),
    });
  });
});
```

### Testing Error Handling

```typescript
test("Test error handling", async () => {
  const t = convexTest({});
  register(t, "myComponent");

  await t.run(async (ctx) => {
    // Test with invalid data
    try {
      await ctx.db.insert("items", {
        name: null, // Should fail validation
        data: {},
        createdAt: Date.now(),
      });
      fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
```

## Testing Best Practices

- Test in isolation: Test component functions independently from the app
- Test edge cases: Test with empty data, large data, special characters, etc.
- Test error handling: Verify that invalid inputs are handled correctly
- Test with the example app: Ensure the component works as expected when installed in an app
- Use descriptive test names: Make it clear what each test is verifying
- Keep tests fast: Avoid slow tests that take too long to run
- Test database operations: Verify that inserts, updates, queries, and deletes work correctly
