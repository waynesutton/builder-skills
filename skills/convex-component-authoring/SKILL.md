---
name: convex-component-authoring
displayName: Convex Component Authoring
description: How to create, structure, and publish self-contained Convex components with proper isolation, exports, and dependency management
version: 1.37.0
author: Convex
tags: [convex, components, reusable, packages, npm]
last-updated: 2026-05-04
---

# Convex Component Authoring

Create self-contained, reusable Convex components with proper isolation, exports, and dependency management for sharing across projects.

## Gotchas

Read these first - these are errors you'll make without being told otherwise:

### Environment-specific gotchas
- **No `ctx.auth` in components**: Components cannot access `ctx.auth`. Do authentication in the app and pass `userId` as an argument.
- **No `process.env` in components**: Components cannot read app environment variables. Pass them as function arguments or use a "globals" table for configuration.
- **No direct client access**: Component functions become internal references. Apps must create wrapper functions in their own convex/ folder to expose to clients.

### API gotchas
- **`.paginate()` doesn't work in components**: Use `paginator` from `convex-helpers` instead.
- **IDs become strings at boundary**: `Id<"tableName">` types in components become plain strings in the ComponentApi. Use `v.string()` for ID arguments.
- **`v.id()` validators are component-scoped**: You cannot validate IDs from another component's tables. All cross-component IDs are strings.
- **Component functions are internal-only**: Component's public queries/mutations/actions can only be called via `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction` from the app, not directly from clients via HTTP or WebSockets.

### HTTP gotchas
- **Component HTTP actions lack `ctx.auth`**: Component HTTP routes cannot access authentication. Define HTTP handlers in the app if authentication is needed.
- **Component HTTP actions lack `process.env`**: Component HTTP routes cannot access environment variables. Pass them as configuration or use app-level HTTP handlers.

### Build gotchas
- **Missing `_generated` directory**: If `src/component/_generated/` doesn't exist after codegen, check for TypeScript errors in your component files.
- **Build order matters**: Follow component codegen → build package → example app codegen sequence to avoid race conditions.
- **Import paths must use `.js`**: Even when working with TypeScript files, import generated code with `.js` extension: `import { query } from "./_generated/server.js"`.

### Schema gotchas
- **Tables are isolated**: Component tables cannot reference tables from the app or other components. Use child components for shared data.
- **Missing validators = `any` types**: Without `args` and `returns` validators, component functions have `any` types for arguments and return values.

### Transaction gotchas
- **Sub-transaction isolation**: When a component mutation throws, only its writes are rolled back. The calling mutation can catch the exception and continue, or let it propagate to roll back all writes.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/components
- Component Authoring: https://docs.convex.dev/components/authoring
- Understanding Components: https://docs.convex.dev/components/understanding
- Using Components: https://docs.convex.dev/components/using
- LLM-optimized documentation: https://docs.convex.dev/llms.txt

## Getting Started

### Quick Start

```bash
# Create a new component
npx create-convex@latest --component

# Or create a local component manually
mkdir convex/components/myComponent
# Create convex.config.ts, schema.ts, and function files
```

### Component Types

**Local components** - Folder in your project, imported directly
**Packaged components** - NPM packages for sharing with others
**Hybrid components** - Local component using shared library code (more complex, use carefully)

Load `references/component-structure.md` for detailed file-by-file structure.

## Component Development Workflow

Follow this workflow when developing a component:

### 1. Create Component Structure

```bash
# Navigate to your project
cd your-project

# Create component directory
mkdir -p convex/components/myComponent
```

Create these core files:

- `convex/components/myComponent/convex.config.ts`
- `convex/components/myComponent/schema.ts`
- `convex/components/myComponent/*.ts` (your functions)

For detailed structure with all files, read `references/component-structure.md`.

### 2. Define Component

```typescript
// convex/components/myComponent/convex.config.ts
import { defineComponent } from "convex/server";

const component = defineComponent("myComponent");
export default component;
```

### 3. Define Schema

```typescript
// convex/components/myComponent/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  items: defineTable({
    name: v.string(),
    data: v.any(),
  }),
});
```

### 4. Create Functions

```typescript
// convex/components/myComponent/hello.ts
import { v } from "convex/values";
import { query } from "./_generated/server.js";

export const world = query({
  args: {},
  returns: v.string(),
  handler: async () => {
    return "hello world";
  },
});
```

### 5. Development Cycle

**Use this validation loop when developing:**

```markdown
Progress:
- [ ] Step 1: Write or modify component functions
- [ ] Step 2: Run codegen
  ```bash
  npx convex codegen --component-dir ./convex/components/myComponent
  ```
- [ ] Step 3: Validate codegen
  ```bash
  ls -la convex/components/myComponent/_generated/
  ```
  If _generated/ is missing or incomplete, check for TypeScript errors.
- [ ] Step 4: Start dev server
  ```bash
  npx convex dev
  ```
- [ ] Step 5: Test component function
  ```bash
  npx convex run --component myComponent hello:world
  ```

**If any step fails:**
1. Check error message
2. Fix the issue
3. Re-run from the failed step
4. Only proceed when all steps pass
```

## Using Components in Your App

### Install Component

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import myComponent from "./components/myComponent/convex.config.js";

const app = defineApp();
app.use(myComponent);
export default app;
```

### Access Component Functions

```typescript
// In your app's functions
import { components } from "./_generated/api";
import { query } from "./_generated/server";

export const getItems = query({
  handler: async (ctx) => {
    return await ctx.runQuery(components.myComponent.list, { limit: 10 });
  },
});
```

### Function Handles

Function handles allow you to pass function references as strings to components, enabling callback patterns.

```typescript
import { createFunctionHandle } from "convex/server";

// Create a handle for a function that the component can call back
const handle = await createFunctionHandle(api.myApp.processResult);

// Pass the handle to a component
await ctx.runMutation(components.myComponent.processWithCallback, {
  callback: handle as any, // Cast to any for v.string() validation
  data: { ... },
});

// In the component, receive the handle as a string
// component/myComponent/processWithCallback.ts
export const processWithCallback = mutation({
  args: {
    callback: v.string(), // Function handles are strings
    data: v.object({ /* ... */ }),
  },
  handler: async (ctx, args) => {
    // Process data...

    // Call back into the app using the handle
    await ctx.scheduler.runAfter(0, args.callback as any, {
      result: processedData,
    });
  },
});
```

Use function handles when:
- A component needs to callback into the app (e.g., migrations, webhooks)
- You need to schedule functions with dynamic references
- Components need to execute app-specific code

### Expose to Clients (Optional)

Create wrapper functions in your app:

```typescript
// convex/myComponent.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.myComponent.list, args);
  },
});
```

For detailed client code patterns (wrappers, re-mounting, classes), read `references/client-code-patterns.md`.

### Component HTTP Actions

Components can define their own HTTP routes in an `http.ts` file:

```typescript
// convex/components/myComponent/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/hello",
  method: "GET",
  handler: httpAction(async () => {
    return new Response("hello from component", { status: 200 });
  }),
});

export default http;
```

To expose component HTTP routes, specify an `httpPrefix` when installing:

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import myComponent from "./components/myComponent/convex.config.js";

const app = defineApp();
app.use(myComponent, { httpPrefix: "/my-component/" });
export default app;
```

With this configuration, component routes are accessible at `/my-component/hello`.

**Important limitations:**
- Component HTTP actions cannot access `ctx.auth`
- Component HTTP actions cannot access `process.env`
- If authentication or environment variables are needed, define HTTP handlers in the app instead

Within a component's HTTP action, `process.env.CONVEX_SITE_URL` includes the `httpPrefix`, allowing you to construct correct URLs for callbacks and redirects.

## Publishing Workflow

### Publishing Checklist

Use this checklist when publishing a component to NPM:

```markdown
Progress:
- [ ] Step 1: Run component codegen
  ```bash
  npx convex codegen --component-dir ./src/component
  ```
- [ ] Step 2: Build the package
  ```bash
  npm run build
  ```
- [ ] Step 3: Validate build output
  ```bash
  ls -la dist/ && ls -la dist/_generated/
  ```
- [ ] Step 4: Run example app codegen
  ```bash
  npx convex dev --typecheck-components
  ```
- [ ] Step 5: Verify component functions work
  ```bash
  npx convex run --component myComponent hello:world
  ```
- [ ] Step 6: Run tests (if present)
  ```bash
  npm test
  ```
- [ ] Step 7: Update version in package.json
- [ ] Step 8: Update CHANGELOG.md with release notes
- [ ] Step 9: Build again to ensure all files are up to date
  ```bash
  npm run build
  ```
- [ ] Step 10: Publish to NPM
  ```bash
  npm publish
  ```

**If any step fails:**
1. Check error message
2. Fix the issue
3. Re-run from the failed step
4. Only proceed when all steps pass
```

For detailed publishing instructions, package.json configuration, and build process, read `references/publishing-workflow.md`.

## Client Code Patterns

Components can provide client code that runs in the app's environment, wrapping component functions with more ergonomic APIs. These patterns allow components to access `ctx.auth`, `process.env`, and other app-level resources.

For detailed client code patterns, read `references/client-code-patterns.md`.

### Simple Function Wrappers

```typescript
// src/client/index.ts
import type { ComponentApi } from "../component/_generated/component.js";

export async function callMyFunction(
  ctx: MutationCtx | ActionCtx,
  component: ComponentApi,
  args: { value: string }
) {
  // Can access process.env and ctx.auth here
  const apiKey = process.env.API_KEY;
  return await ctx.runMutation(component.call.fn, {
    ...args,
    apiKey,
  });
}
```

### Class-Based Clients

```typescript
// src/client/index.ts
export class MyComponentClient {
  private apiKey: string;

  constructor(
    public component: ComponentApi,
    options?: {
      API_KEY?: string;
    },
  ) {
    this.apiKey = options?.API_KEY ?? process.env.API_KEY!;
  }

  async doSomething(ctx: GenericQueryCtx<GenericDataModel>) {
    return await ctx.runQuery(this.component.count, {
      apiKey: this.apiKey,
    });
  }
}
```

Usage in app:
```typescript
// convex/myComponent.ts
import { MyComponentClient } from "@your/package";
import { components } from "./_generated/server";

const client = new MyComponentClient(components.myComponent, {
  API_KEY: "custom-key",
});
```

## Testing

### Test Component Functions

Load `references/testing-patterns.md` for complete testing guide including test helper implementation and test patterns.

### Quick Test (Local Component)

```typescript
// component/some.test.ts
import { test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.ts";

// Import all component modules
const modules = import.meta.glob("./**/*.ts");

test("Test component functionality", async () => {
  const t = convexTest(schema, modules);

  await t.run(async (ctx) => {
    // Test component logic
    await ctx.db.insert("items", { name: "test", data: {} });
  });
});
```

### Quick Test (Packaged Component with Test Helper)

```typescript
// convex/some.test.ts
import { test, expect } from "vitest";
import { convexTest } from "convex-test";
import componentTest from "@your/package/test";

test("Test component functionality", async () => {
  const t = convexTest();
  componentTest.register(t, "myComponent");

  await t.run(async (ctx) => {
    // Test component logic
    const result = await ctx.runQuery(components.myComponent.someFunction, {
      arg: "value",
    });
    expect(result).toBe("expected");
  });
});
```

### Manual Component Registration

If the component doesn't provide a test helper:

```typescript
import { test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./path/to/component/schema.ts";

const modules = import.meta.glob("./path/to/component/**/*.ts");

test("Test local component", async () => {
  const t = convexTest();
  t.registerComponent("componentName", schema, modules);

  await t.run(async (ctx) => {
    await ctx.runQuery(components.componentName.someQuery, {
      arg: "value",
    });
  });
});
```

## When to Load Reference Files

- **Component structure details**: Load `references/component-structure.md` when creating or modifying component files
- **Publishing workflow**: Load `references/publishing-workflow.md` when building and publishing components
- **Testing setup**: Load `references/testing-patterns.md` when setting up or debugging tests
- **Client code patterns**: Load `references/client-code-patterns.md` when wrapping component functions for app integration
- **Examples**: Load `references/examples.md` for reference implementations (rate limiter, etc.)

## Best Practices

- Keep component tables isolated - don't reference main app tables or other components' tables
- All public component functions should have argument and return validators
- Export clear TypeScript types for consumers
- Test components in isolation before publishing
- Use semantic versioning for component releases
- Document all public functions and their arguments
- Use the official component template: `npx create-convex@latest --component`
- Use function handles for callback patterns between components and apps
- Consider providing client code patterns (wrappers, classes) for easier integration
- Use `httpPrefix` to namespace component HTTP routes and avoid conflicts
- Leverage sub-transaction isolation for error handling in components

## Common Pitfalls

1. **Cross-referencing tables** - Component tables should be self-contained. Use child components if you need to share data.
2. **Missing type exports** - Export all necessary types from `src/client/index.ts` and `@your/package/_generated/component.js`
3. **Hardcoded configuration** - Pass environment variables as arguments or use a "globals" table for configuration
4. **Missing validators** - Without validators, function arguments and return values are typed as `any`
5. **Assuming ctx.auth exists** - Components cannot access `ctx.auth`; do authentication in the app
6. **Using built-in pagination** - `.paginate()` doesn't work in components; use `paginator` from `convex-helpers`
7. **Assuming process.env works** - Components cannot access the app's environment variables; pass them as arguments
8. **Not re-exporting for client access** - Component functions become internal references; create wrapper functions in the app for client access
9. **Using `.public` namespace** - Component functions are accessed directly (`components.myComponent.func`), not via `components.myComponent.public.func`
10. **Forgetting httpPrefix** - Component HTTP routes are not exposed unless an `httpPrefix` is specified
11. **Assuming component mutations rollback all writes** - Component mutations are sub-transactions; only their writes rollback on error, not the caller's writes
12. **Not using function handles for callbacks** - Use `createFunctionHandle` when components need to call back into the app

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Components: https://docs.convex.dev/components
- Component Authoring: https://docs.convex.dev/components/authoring
- Component Template: https://github.com/get-convex/templates/tree/main/template-component
- Convex Helpers: https://npmjs.com/package/convex-helpers
- Convex Components Directory: https://convex.dev/components
- Better Auth Component: https://convex-better-auth.netlify.app/features/local-install
- ProseMirror Component: https://www.convex.dev/components/prosemirror-sync
- Workpool Component: https://www.convex.dev/components/workpool
- RAG Component: https://www.convex.dev/components/rag
- Twilio Component: https://github.com/get-convex/twilio
