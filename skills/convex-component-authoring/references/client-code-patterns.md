# Client Code Patterns

Patterns for wrapping component functions in app code.

## Wrapping the Component with Client Code

Sometimes you want to provide a simpler API than directly calling component functions, add type safety, or provide functionality that spans the component's boundary. This code runs in the app's environment with access to `ctx.auth`, `process.env`, and other app-level resources.

**Note:** An important aspect of this pattern is that the code running in the app has access to `ctx.auth`, `process.env`, and other app-level resources. For many use-cases, this is important, such as running code to define migrations in the app, which are then run from the Migrations Component. On the other hand, apps that want really tight control over what code runs in their app may prefer to call the component's functions directly.

## Using a Component in Your App

Once a component is installed (either locally or as an NPM package), you can access its functions from your app's code.

```typescript
// In the consuming app's convex/someFile.ts
import { components } from "./_generated/api";
import { query, mutation } from "./_generated/server";

// Call component functions from your app's functions
export const getItems = query({
  handler: async (ctx) => {
    return await ctx.runQuery(components.myComponent.list, { limit: 10 });
  },
});

export const createItem = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.myComponent.create, { name: args.name, data: {} });
  },
});
```

## Running Component Functions

After a component function is deployed, you can run it from the command line:

```bash
npx convex run --component myComponent hello:world
```

You can also run it from a function in your app:

```typescript
// convex/sayHi.ts
import { components } from "./_generated/api";
import { query } from "./_generated/server";

export default query({
  handler: async (ctx) => {
    return await ctx.runQuery(components.myComponent.hello.world);
  },
});
```

Try it out: `npx convex run sayHi`.

## Re-exporting Component Functions

To make component functions directly callable from clients, create wrapper functions in your app:

```typescript
// In the consuming app's convex/myComponent.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.myComponent.list, args);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.myComponent.create, args);
  },
});
```

Now React clients can use them:

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function MyApp() {
  const items = useQuery(api.myComponent.list, { limit: 10 });
  const createItem = useMutation(api.myComponent.create);

  return (
    <div>
      {items?.map((item) => (
        <div key={item._id}>{item.name}</div>
      ))}
      <button onClick={() => createItem({ name: "New", data: {} })}>
        Add Item
      </button>
    </div>
  );
}
```

This is the recommended pattern, as it makes it clear to the user how the request is being authenticated. However, if you need to re-export a lot of functions, you can use the next pattern.

## Simple Function Wrappers

The simplest approach is to define standalone functions that wrap calls to the component. This works well for straightforward operations and utilities.

```typescript
// src/client/index.ts
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

export async function callMyFunction(
  ctx: MutationCtx | ActionCtx,
  component: ComponentApi,
  args: { value: number },
) {
  // You can create function handles, add shared utilities,
  // or do any processing that needs to run in the app's environment.
  const functionHandle = await createFunctionHandle(args.someFn);
  const someArg = process.env.SOME_ARG;
  await ctx.runMutation(component.call.fn, {
    ...args,
    someArg,
    functionHandle,
  });
}

// Useful types for functions that only need certain capabilities.
type MutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;
```

**Note:** we only use `ctx.runMutation`, so we can use `Pick` to select a type that only includes that function. This allows users to call it even if their `ctx` is not exactly the standard MutationCtx. It also means it can be called from an Action, as ActionCtx also includes `ctx.runMutation`. If your function also needs auth or storage, you can adjust what you `Pick`.

## Re-mounting an API

Provide ready-made functions that apps can re-export:

```typescript
// src/client/index.ts
import type { Auth } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

export function makeMyComponentAPI(
  component: ComponentApi,
  options: {
    auth: (ctx: { auth: Auth }, operation: "read" | "write") => Promise<string>;
  },
) {
  return {
    add: mutation({
      args: { value: v.number() },
      handler: async (ctx, args) => {
        await options.auth(ctx, "write");
        return await ctx.runMutation(component.add, args);
      },
    }),
    get: query({
      args: {},
      handler: async (ctx) => {
        await options.auth(ctx, "read");
        return await ctx.runQuery(component.get, {});
      },
    }),
  };
}
```

Apps use it like:

```typescript
// convex/myComponent.ts
import { makeMyComponentAPI } from "@your/package";
import { components } from "./_generated/server.js";

export const { add, get } = makeMyComponentAPI(components.myComponent, {
  auth: async (ctx, operation) => {
    const userId = await getAuthUserId(ctx);
    if (operation === "write" && !userId) {
      throw new Error("User not authenticated");
    }
    return userId;
  },
});
```

This pattern is also useful for components that need to provide functions with specific signatures for integration purposes.

**Real-world example:** [ProseMirror component](https://github.com/get-convex/prosemirror-sync/blob/91e19d5e5a2a272d44f3a31c9171e111dc98676c/src/client/index.ts#L171C4-L173C6) exports ready-made functions.

## Class-Based Clients

For more complex components, a class-based client provides a stateful interface that can hold configuration and provide multiple methods.

**Basic class pattern:**

```typescript
import Foo from "@convex-dev/foo";
import { components } from "./_generated/server.js";

const foo = new Foo(components.foo, {
  maxShards: 10,
});
```

**With configuration options:**

Classes typically accept the component reference as their first argument, with optional configuration as the second:

```typescript
export class MyComponent {
  private apiKey: string;

  constructor(
    public component: ComponentApi,
    options?: {
      maxShards?: number;
      // Named after the environment variable it overrides, for clarity.
      API_KEY?: string;
    },
  ) {
    this.apiKey = options?.API_KEY ?? process.env.API_KEY!;
  }

  async count(ctx: GenericQueryCtx<GenericDataModel>) {
    return await ctx.runQuery(this.component.count, {
      API_KEY: this.apiKey,
    });
  }
}
```

**Dynamic instantiation:** Note that clients don't need to be instantiated statically. If you need runtime values, you can create instances dynamically:

```typescript
export const myQuery = query({
  handler: async (ctx, args) => {
    const foo = new MyComponent(components.myComponent, {
      apiKey: args.customApiKey,
    });
    await foo.count(ctx);
  },
});
```

## Component Configuration Options

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import myComponent from "./components/myComponent/convex.config.js";

const app = defineApp();

// Basic usage
app.use(myComponent);

// With custom name
app.use(myComponent, { name: "customName" });

// Multiple instances
app.use(myComponent, { name: "instance1" });
app.use(myComponent, { name: "instance2" });

export default app;
```

## Best Practices for Client Code

- Add authentication in wrapper functions, not in the component
- Pass environment variables as arguments to component functions
- Provide type-safe interfaces for component interactions
- Use the simplest pattern that meets your needs (wrappers → re-mounting → classes)
- Export clear TypeScript types for consumers
- Document all public functions and their arguments
- Test client code with the example app
- Consider using function handles for callback patterns
