---
name: convex-http-actions
description: "Adds HTTP endpoints in convex/http.ts: webhook receivers with signature checks, REST style routes, CORS, auth headers, streaming responses, and file uploads over HTTP. Use when integrating Stripe, Clerk, Resend, or any service that calls back into the app, or when a client needs a plain HTTP API."
---

# Convex HTTP actions

Defines public HTTP endpoints served from the deployment's `.convex.site` domain. The one rule: an `httpAction` handler treats every byte of the request as untrusted, verifies it, then calls `internal.*` functions with `ctx.runQuery` or `ctx.runMutation`. It never reads or writes `ctx.db` directly.

## When to reach for this

- A third party (Stripe, Clerk, Resend, GitHub) needs a URL to POST events to
- A client without the Convex SDK (mobile app, CLI, another backend) needs a plain HTTP API
- A browser needs to download or stream bytes without going through `useQuery`
- A script or form needs to upload bytes over HTTP instead of an upload URL

## httpAction or mutation

| Caller | Use |
| --- | --- |
| Your own React or Next.js app using `convex/react` | `query` and `mutation`. Skip HTTP actions. |
| External service sending webhooks | `httpAction` |
| Client that cannot use the Convex SDK | `httpAction` |
| Scheduled or internal work | `internalMutation` or `internalAction` |

HTTP actions get no argument validators and no automatic auth. They run in the default Convex runtime, so Web APIs (`fetch`, `crypto.subtle`, `Response`, `ReadableStream`) work without `"use node"`. Request and response bodies are capped at 20MB.

## Router skeleton

The router must live at `convex/http.ts` and be the default export. A router in any other file is ignored.

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/api/items",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: { name?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    if (typeof body.name !== "string") {
      return json({ error: "name is required" }, 400);
    }
    const id = await ctx.runMutation(internal.items.create, { name: body.name });
    return json({ id }, 201);
  }),
});

export default http;

// JSON response helper shared by every route in this file
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

The endpoint is reachable at `https://<deployment>.convex.site/api/items`. Note `.convex.site`, not `.convex.cloud`. `path` matches exactly; use `pathPrefix: "/api/items/"` for dynamic segments and read the tail from `new URL(request.url).pathname`.

## Calling queries and mutations from the handler

`ctx.runQuery`, `ctx.runMutation`, `ctx.runAction`, `ctx.storage`, `ctx.scheduler`, and `ctx.auth` are all available inside `httpAction`. Point them at `internal.*` functions so database logic is not also exposed as a public Convex function. Arguments still pass through the target's validators, so a bad shape fails there with a clear error.

```typescript
// convex/items.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const create = internalMutation({
  args: { name: v.string() },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("items", { name: args.name });
  },
});
```

For slow work (sending email, calling an LLM), respond 200 right away and hand off with `ctx.scheduler.runAfter(0, internal.jobs.process, args)`. Providers time out and retry if the handler stalls.

## Webhook with signature verification

Read the raw body once with `request.text()`. Parsing first changes the bytes and breaks the signature. This generic HMAC SHA-256 pattern covers most providers; Stripe, Clerk, and Resend specifics are in the reference below.

```typescript
// convex/http.ts (add to the router above)
http.route({
  path: "/webhooks/provider",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-signature");
    if (!signature) return new Response("Missing signature", { status: 400 });

    const raw = await request.text();
    const secret = process.env.PROVIDER_WEBHOOK_SECRET;
    if (!secret) return new Response("Webhook secret not configured", { status: 500 });
    if (!(await verifyHmac(raw, signature, secret))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(raw) as { id: string; type: string; data: unknown };
    // The mutation returns early if this event id was already processed.
    await ctx.runMutation(internal.webhooks.record, {
      source: "provider",
      eventId: event.id,
      type: event.type,
      payload: event.data,
    });
    return new Response(null, { status: 200 });
  }),
});

async function verifyHmac(payload: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(expected, signature);
}

// Constant time compare so response timing does not leak the signature
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

Providers retry on any non 2xx and sometimes on network flakes, so the same event arrives more than once. Deduplicate by event id inside the mutation, which is a transaction:

```typescript
// convex/webhooks.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const record = internalMutation({
  args: { source: v.string(), eventId: v.string(), type: v.string(), payload: v.any() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_source_and_event_id", (q) =>
        q.eq("source", args.source).eq("eventId", args.eventId),
      )
      .unique();
    if (seen) return null;
    await ctx.db.insert("webhookEvents", args);
    // Apply the event's side effects here, in the same transaction.
    return null;
  },
});
```

Schema: `webhookEvents: defineTable({ source: v.string(), eventId: v.string(), type: v.string(), payload: v.any() }).index("by_source_and_event_id", ["source", "eventId"])`.

Open [references/webhooks.md](references/webhooks.md) for Stripe (`constructEvent` in a Node action), Clerk and Resend (svix headers), replay protection with timestamps, and a fuller idempotency table with status tracking.

## CORS, path params, auth headers, streaming, files

Browsers send an `OPTIONS` preflight before cross origin `POST`s, so each browser facing path needs an `OPTIONS` route returning the same `Access-Control-*` headers as the real route. Bearer tokens from your configured auth provider are read with `await ctx.auth.getUserIdentity()`, the same call used in queries. Streaming works by returning `new Response(readableStream)`, and files are served with `ctx.storage.get(storageId)` or accepted with `request.blob()` then `ctx.storage.store(blob)`.

Open [references/rest-and-cors.md](references/rest-and-cors.md) when building a REST style API: path parameters and id validation, the CORS preflight pair, JSON error conventions, bearer and API key auth, streaming responses, and file upload and download routes.

## Common mistakes

| Mistake | Why it breaks | Do instead |
| --- | --- | --- |
| Router in `convex/api.ts` or `convex/routes.ts` | Only `convex/http.ts` is loaded as the router | Keep one `http.ts` with `export default http` |
| Calling `https://<deployment>.convex.cloud/webhooks/...` | HTTP actions live on `.convex.site` | Use the `.convex.site` URL in the provider dashboard |
| `await request.json()` before verifying the signature | The reserialized body no longer matches the signed bytes | `request.text()` once, verify, then `JSON.parse` |
| Trusting the body because "it came from Stripe" | Anyone can POST to a public URL | Verify the signature on every request |
| Using `api.*` targets from `runMutation` | Exposes the same logic twice, once unauthenticated | Target `internal.*` functions |
| No `OPTIONS` route for a browser called endpoint | Preflight fails, the real request never sends | Add an `OPTIONS` route per path with CORS headers |
| Doing minutes of work inside the handler | Provider times out and retries, duplicating work | Return 200 fast, schedule with `ctx.scheduler.runAfter` |
| Processing the same event twice | Providers retry on any non 2xx | Dedupe by event id in the mutation |
| Missing `Content-Type: application/json` on responses | Clients get text they cannot parse | Use a `json()` helper for every JSON response |

## Checklist

- [ ] Router is at `convex/http.ts` and exported as default
- [ ] Every route parses the body inside `try/catch` and returns 400 on bad input
- [ ] Handlers call `internal.*` functions, never `ctx.db`
- [ ] Webhook routes read `request.text()` once and verify the signature before parsing
- [ ] Webhook secrets come from `process.env` and are set in the deployment, not hardcoded
- [ ] Events are deduplicated by provider event id inside a mutation
- [ ] Slow work is scheduled, and the handler returns 2xx quickly
- [ ] Browser called routes have a matching `OPTIONS` route
- [ ] The provider dashboard points at the `.convex.site` URL
- [ ] JSON responses set `Content-Type: application/json`

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/functions/http-actions
- https://docs.convex.dev/auth/clerk
- https://docs.convex.dev/file-storage/serve-files
