---
name: convex-http-actions
displayName: Convex HTTP Actions
description: External API integration and webhook handling including HTTP endpoint routing, request/response handling, authentication, CORS configuration, and webhook signature validation
version: 1.37.0
author: Convex
tags: [convex, http, actions, webhooks, api, endpoints]
last-updated: 2026-05-04
---

# Convex HTTP Actions

Build HTTP endpoints for webhooks, external API integrations, and custom routes in Convex applications.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/functions/http-actions
- Actions Overview: https://docs.convex.dev/functions/actions
- Authentication: https://docs.convex.dev/auth
- For broader context: https://docs.convex.dev/llms.txt

## Core Concepts

HTTP actions receive a [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) and return a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) following the Fetch API. They can:
- Interact with the database via `ctx.runQuery` and `ctx.runMutation`
- Call other actions via `ctx.runAction`
- Access file storage via `ctx.storage`
- Use authentication via `ctx.auth.getUserIdentity()`
- Schedule functions via `ctx.scheduler`

**Note:** HTTP actions do NOT support argument validation. You must parse and validate request data manually.

## Routing

### Basic Router Setup

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
```

### Path Prefix Routing

Use `pathPrefix` for dynamic routes:

```typescript
http.route({
  pathPrefix: "/api/users/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const userId = url.pathname.replace("/api/users/", "");
    // Handle user ID...
  }),
});
```

### HTTP Prefix Configuration

Namespace all routes under a path prefix using `convex/convex.config.ts`:

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";

const app = defineApp({ httpPrefix: "/app/" });
export default app;
```

With this, a route for `/hello` becomes accessible at `/app/hello`.

## Request Handling

### Parse Request Body

```typescript
// JSON body
const body = await request.json();

// Form data
const formData = await request.formData();
const name = formData.get("name");

// Text
const text = await request.text();

// Blob
const blob = await request.blob();

// ArrayBuffer
const buffer = await request.arrayBuffer();

// Raw bytes (alias for ArrayBuffer)
const bytes = await request.bytes();
```

### Access Request Data

```typescript
// Headers
const authHeader = request.headers.get("Authorization");
const contentType = request.headers.get("Content-Type");

// URL and query parameters
const url = new URL(request.url);
const queryParam = url.searchParams.get("filter");
```

## CORS Configuration

### CORS Pattern

```typescript
// Use environment variables for origins
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  Vary: "origin",
});

// Preflight handler
http.route({
  path: "/api/data",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("Origin")),
    });
  }),
});

// Actual endpoint
http.route({
  path: "/api/data",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request.headers.get("Origin")),
      },
    });
  }),
});
```

## Authentication

### Convex Built-in Auth

Use `ctx.auth.getUserIdentity()` to access authenticated user identity:

```typescript
http.route({
  path: "/api/user",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Use identity.tokenIdentifier, identity.name, etc.
    return new Response(JSON.stringify({ userId: identity.subject }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});
```

**Client side:** Call with `Authorization: Bearer <jwt-token>` header.

### Custom API Key Authentication

```typescript
http.route({
  path: "/api/protected",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = request.headers.get("X-API-Key");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isValid = await ctx.runQuery(internal.auth.validateApiKey, { apiKey });

    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process authenticated request
    const data = await ctx.runQuery(internal.data.getProtectedData, {});
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});
```

### Service Authentication

For external services that can't obtain OpenID JWTs, use a shared secret:

```typescript
const SERVICE_SECRET = process.env.SERVICE_SECRET!;

http.route({
  path: "/api/service",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = request.headers.get("X-Service-Secret");

    if (secret !== SERVICE_SECRET) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process service request
  }),
});
```

## Webhook Handling

### Basic Webhook Pattern

```typescript
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    const body = await request.text();

    try {
      await ctx.runAction(internal.stripe.verifyAndProcessWebhook, {
        body,
        signature,
      });
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Webhook error", { status: 400 });
    }
  }),
});
```

### Webhook Signature Verification (Node.js Runtime)

```typescript
// convex/stripe.ts
"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const verifyAndProcessWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    const event = stripe.webhooks.constructEvent(
      args.body,
      args.signature,
      webhookSecret
    );

    switch (event.type) {
      case "checkout.session.completed":
        await ctx.runMutation(internal.payments.handleCheckoutComplete, {
          sessionId: event.data.object.id,
        });
        break;
    }
  },
});
```

## Calling Database Functions

```typescript
http.route({
  path: "/api/items",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    // Call a mutation
    const itemId = await ctx.runMutation(internal.items.create, {
      name: body.name,
    });

    // Query the created item
    const item = await ctx.runQuery(internal.items.get, { id: itemId });

    return new Response(JSON.stringify(item), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }),
});
```

## File Upload

```typescript
http.route({
  path: "/api/upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const blob = await request.blob();
    const contentType = request.headers.get("Content-Type") ?? "application/octet-stream";

    const storageId = await ctx.storage.store(blob);

    return new Response(JSON.stringify({ storageId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});
```

## File Downloads

```typescript
http.route({
  pathPrefix: "/files/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const fileId = url.pathname.replace("/files/", "") as Id<"_storage">;

    const fileUrl = await ctx.storage.getUrl(fileId);

    if (!fileUrl) {
      return new Response("File not found", { status: 404 });
    }

    return Response.redirect(fileUrl, 302);
  }),
});
```

## Error Handling Pattern

```typescript
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}

http.route({
  path: "/api/process",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const contentType = request.headers.get("Content-Type");
      if (!contentType?.includes("application/json")) {
        return errorResponse("Content-Type must be application/json", 415);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      const result = await ctx.runMutation(internal.process.handle, { data: body.data });
      return jsonResponse({ success: true, result });
    } catch (error) {
      console.error("Processing error:", error);
      return errorResponse("Internal server error", 500);
    }
  }),
});
```

## Limits

- **Request/response size:** 20MB
- **Action timeout:** 10 minutes
- **Memory limits:** 512MB (Node.js runtime), 64MB (Convex runtime)
- **Concurrent operations:** Up to 1000

## Runtime Selection

### Convex Runtime (Default)

- Faster cold starts
- Supports `fetch` API
- Some npm packages supported
- Use for simple API calls

```typescript
import { httpAction } from "./_generated/server";

http.route({
  path: "/api/fetch",
  method: "GET",
  handler: httpAction(async () => {
    const data = await fetch("https://api.example.com");
    return new Response(data.body);
  }),
});
```

### Node.js Runtime

- Use `"use node"` directive at file top
- Full Node.js APIs and npm packages
- For webhook signature verification, crypto operations, etc.

```typescript
// convex/myWebhook.ts
"use node";

import { internalAction } from "./_generated/server";
import Stripe from "stripe";

export const verifyWebhook = internalAction({
  // ... uses Stripe SDK
});
```

## Debugging

Follow this 3-step process when HTTP actions aren't working:

### 1. Verify deployment
Check the [functions page](https://dashboard.convex.dev/deployment/functions) in the dashboard and confirm there's an entry called `http`.

### 2. Test with curl
Get your URL from dashboard Settings > URL and Deploy Key (must end in `.convex.site`):

```bash
curl -X GET https://<deployment-name>.convex.site/myEndpoint
```

Check the [logs page](https://dashboard.convex.dev/deployment/logs) to confirm the request.

### 3. Inspect browser requests
Open Network tab in browser dev tools, trigger the request, and verify:
- URL matches your curl test (ends in `.convex.site`)
- No CORS errors in console
- Request appears in dashboard logs

## Components

Components can define their own HTTP routes that are mounted under a prefix. See [Using Components: HTTP Routes](https://docs.convex.dev/components/using.md#http-routes).

## Gotchas

- **Missing CORS preflight handler** - Browsers send OPTIONS requests first; you must handle them
- **Not validating webhook signatures** - Security vulnerability; always verify signatures before processing
- **Using wrong runtime** - Node.js SDKs (Stripe, etc.) require `"use node"`; simple fetch calls should use Convex runtime for speed
- **Hardcoded CORS origins** - Use environment variables like `process.env.CLIENT_ORIGIN` for flexibility
- **Missing Content-Type headers** - Clients may not parse responses correctly
- **Not handling JSON parse errors** - Invalid JSON will throw; always try/catch `request.json()`
- **Using `.convex.cloud` URL** - HTTP actions are at `.convex.site`, not `.convex.cloud`
- **Calling `ctx.runAction` unnecessarily** - Only use `ctx.runAction` to cross runtimes (Convex ↔ Node.js); otherwise use helper functions
- **Forgetting Vary: origin header** - Required when `Access-Control-Allow-Origin` varies dynamically
- **Blocking on long operations** - Use scheduled functions for heavy processing; HTTP actions have 10-minute timeout

## Best Practices

- Always validate and sanitize incoming request data
- Use internal functions for database operations
- Implement proper error handling with appropriate status codes
- Log webhook events for debugging
- Use environment variables for secrets and CORS origins
- Handle request body parsing errors
- Use Convex runtime by default, Node.js only when needed
- Validate work before execution for destructive operations
- Never run `npx convex deploy` unless explicitly instructed
- Never run git commands unless explicitly instructed

## References

- Convex Documentation: https://docs.convex.dev/
- HTTP Actions: https://docs.convex.dev/functions/http-actions
- Actions: https://docs.convex.dev/functions/actions
- Authentication: https://docs.convex.dev/auth
- Runtimes: https://docs.convex.dev/functions/runtimes
