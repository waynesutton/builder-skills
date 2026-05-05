# Publishing Workflow

Complete guide for building and publishing Convex components.

## Getting Started

### Use the Official Template

The easiest way to start is with the official component template:

```bash
npx create-convex@latest --component
```

This sets up the complete project structure with build scripts and configuration. Follow the CLI's instructions to get started and keep the component's generated code up-to-date.

### Local Package Resolution for Development

When developing a component, you generally want to be importing the component's code in the same way that apps will import it, e.g. `import {} from "@your/package"`. To achieve this without having to install the package from NPM in the example app, follow the template's project structure:

1. In the root of the project, have the `package.json` with the package name matching the `@your/package` name. This causes imports for that name to resolve to the `package.json`'s `exports`.
2. In the `exports` section of the `package.json`, map the entry points to the bundled files, generally in the `dist` directory. This means imports from the package name will resolve to the bundled files.
3. Have a single package.json file and node_modules directory in the root of the project, so the example app will resolve to the package name by default. This will also avoid having multiple versions of `convex` referenced by the library vs. the example app. To add dependencies used only by the example app, add them as `devDependencies` in the `package.json`.

## Entry Points

When publishing a component on NPM, you will need to expose all the relevant entry points to be used in your project:

- `@your/package` exports types, classes, and constants used to interact with the component from within their app's code. This is optional, but common.
- `@your/package/convex.config.js` exposes the component's config.
- `@your/package/_generated/component.js` exports the `ComponentApi` type, which describes the component's types from the point of view of app it's used in.
- `@your/package/test` for utilities to use the component with `convex-test`.

## Build Process

For packaged components, follow this process:

1. **Component codegen**: Generate code for the component itself

   ```bash
   npx convex codegen --component-dir ./src/component
   ```

2. **Build the package**: Build the NPM package

   ```bash
   npm run build # Your build command (e.g., tsc, esbuild, etc.)
   ```

3. **Example app codegen & deploy**: Generate code for the example app and deploy it

   ```bash
   npx convex dev --typecheck-components # optionally type-check the components
   ```

**Note on ordering:** The ideal ordering is: component codegen → build the package → example app `convex dev` runs. This is a recommended convention followed by the template to avoid builds racing with each other, but the key requirement is that the component must be built and available before the example app tries to import it.

## Publishing Checklist

Use this checklist when publishing a component:

- [ ] Run component codegen
  ```bash
  npx convex codegen --component-dir ./src/component
  ```
- [ ] Build the package
  ```bash
  npm run build
  ```
- [ ] Validate build output
  ```bash
  ls -la dist/ && ls -la dist/_generated/
  ```
- [ ] Run example app codegen
  ```bash
  npx convex dev --typecheck-components
  ```
- [ ] Verify component functions work
  ```bash
  npx convex run --component myComponent hello:world
  ```
- [ ] Run tests (if present)
  ```bash
  npm test
  ```
- [ ] Update version in package.json
- [ ] Update CHANGELOG.md with release notes
- [ ] Build again to ensure all files are up to date
  ```bash
  npm run build
  ```
- [ ] Publish to NPM
  ```bash
  npm publish
  ```

**If any step fails:**
1. Check error message
2. Fix the issue
3. Re-run from the failed step
4. Only proceed when all steps pass

## Publishing to NPM

To publish a component on NPM, check out [PUBLISHING.md](https://github.com/get-convex/templates/blob/main/template-component/PUBLISHING.md) in the component template for detailed instructions.

## Static Configuration

A common pattern to track configuration in a component is to have a "globals" table with a single document that contains the configuration. You can then define functions to update this document from the CLI or from the app. To read the values, you can query them with `ctx.db.query("globals").first();`.

```typescript
// Get configuration
const config = await ctx.db.query("globals").first();

// Update configuration
export const setConfig = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("globals").first();
    if (existing) {
      await ctx.db.patch(existing._id, { [args.key]: args.value });
    } else {
      await ctx.db.insert("globals", { [args.key]: args.value });
    }
  },
});
```

## Validation

All public component functions should have argument and return validators. Otherwise, the argument and return values will be typed as `any`. Below is an example of using validators.

```typescript
import schema from "./schema";

const messageDoc = schema.tables.messages.validator.extend({
  _id: v.id("messages"),
  _creationTime: v.number(),
});

export const getLatestMessage = query({
  args: {},
  returns: v.nullable(messageDoc),
  handler: async (ctx) => {
    return await ctx.db.query("messages").order("desc").first();
  },
});
```

Find out more information about function validation [here](/functions/validation.md).

## Function Handles

Function handles allow components to call back into the app or be passed around as strings.

```typescript
import { createFunctionHandle } from "convex/server";

// Create a handle from a function reference
const handle = await createFunctionHandle(api.foo.bar);
```

This handle is a string. Since it's a string, you can pass it between functions and even store it in a table. You would use `v.string()` in args/schema validators.

When you want to use it, cast it back to FunctionHandle and use it as you would use a function reference. Note argument and return value validation still run at runtime, so don't worry about losing guarantees.

```typescript
const handleString = someDoc.handle;
const result = await ctx.runMutation(handleString as FunctionHandle<"mutation">, args);

// Or run it asynchronously via the scheduler:
await ctx.scheduler.runAfter(0, handleString as FunctionHandle<"mutation">, args);
```

**Function reference restrictions:** Function references (like `api.foo.bar`, `internal.foo.bar`, or `components.counter.foo.bar`) are restricted - a component can only use references to its own functions or the public functions of its children. If you have a valid function reference, you can turn it into a handle as shown above.

**Real-world examples:**
- [Workpool component](https://github.com/get-convex/workpool) uses function handles for worker pools
- Twilio component uses handles for SMS callback functions

## Best Practices for Publishing

- Keep component tables isolated - don't reference main app tables or other components' tables
- All public component functions should have argument and return validators
- Export clear TypeScript types for consumers via `src/client/index.ts`
- Document all public functions and their arguments
- Use semantic versioning for component releases
- Include comprehensive README with examples
- Test components in isolation before publishing
- Use the official component template: `npx create-convex@latest --component`
- Provide client code patterns for wrapping component functions with auth, rate limiting, etc.
- Export test helpers via `@your/package/test` entry point
