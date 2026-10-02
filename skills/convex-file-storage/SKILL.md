---
name: convex-file-storage
description: "Handles files in Convex: upload URLs, storing blobs from actions, serving with getUrl or an HTTP action, metadata from the _storage table, and deletion. Use when users upload images or documents, when an action fetches a file from a third party, or when a file URL expires unexpectedly."
---

# Convex file storage

Produces the upload, store, serve, and delete functions for files in Convex. The one rule: persist the `Id<"_storage">`, never the URL string. URLs are resolved in queries with `ctx.storage.getUrl` at read time.

## Schema

Keep your own table for app metadata (name, owner, purpose) and point at `_storage` by id. Convex keeps size, content type, and hash in the `_storage` system table.

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    ownerId: v.id("users"),
  }).index("by_owner", ["ownerId"]),
});
```

## Upload flow

Three steps: a mutation hands out a short lived upload URL, the client POSTs the file to it, then a second mutation saves the returned `storageId`. Upload URLs expire after one hour, so generate a fresh one per upload and never store it.

```typescript
// convex/files.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await getCurrentUser(ctx); // only signed in users get an upload slot
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveFile = mutation({
  args: { storageId: v.id("_storage"), name: v.string() },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    // Server side validation reads the real size and type from _storage.
    // Client checks are for UX only; anyone can POST to the upload URL.
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw new Error("Upload not found");
    if (meta.size > MAX_BYTES || !ALLOWED_TYPES.includes(meta.contentType ?? "")) {
      await ctx.storage.delete(args.storageId);
      throw new Error("File type or size not allowed");
    }

    return await ctx.db.insert("files", {
      storageId: args.storageId,
      name: args.name,
      contentType: meta.contentType ?? "application/octet-stream",
      size: meta.size,
      ownerId: user._id,
    });
  },
});
```

```tsx
// src/FileUploader.tsx
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useState } from "react";

const MAX_BYTES = 10 * 1024 * 1024;

export function FileUploader() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveFile = useMutation(api.files.saveFile);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) return setStatus("error");

    setStatus("uploading");
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type }, // recorded as the file's contentType
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await saveFile({ storageId, name: file.name });
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return <input type="file" accept="image/*,.pdf" onChange={handleChange} disabled={status === "uploading"} />;
}
```

## Storing a blob from an action

`ctx.storage.store` is available in actions and HTTP actions, not in mutations. Plain `fetch` works in the default runtime, so `"use node"` is only needed when a Node library produces the bytes. When building bytes yourself, wrap them first: `new Blob([bytes], { type: "application/pdf" })`. Without a `type` the file serves as `application/octet-stream`.

```typescript
// convex/importFile.ts
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const importFromUrl = action({
  args: { url: v.string(), name: v.string(), ownerId: v.id("users") },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    const response = await fetch(args.url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    // response.blob() carries the Content-Type header into blob.type
    const blob = await response.blob();
    const storageId = await ctx.storage.store(blob);

    return await ctx.runMutation(internal.files.saveImported, {
      storageId,
      name: args.name,
      ownerId: args.ownerId,
    });
  },
});
```

## Serving with getUrl

Resolve the URL inside the query that returns the file. The client renders `url` directly in `img`, `iframe`, or a download link.

```typescript
// convex/files.ts
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("files"),
      name: v.string(),
      contentType: v.string(),
      size: v.number(),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const files = await ctx.db
      .query("files")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();
    return await Promise.all(
      files.map(async (f) => ({
        _id: f._id,
        name: f.name,
        contentType: f.contentType,
        size: f.size,
        url: await ctx.storage.getUrl(f.storageId),
      })),
    );
  },
});
```

`getUrl` returns `null` when the file was deleted. Handle that in the UI instead of assuming a string.

## Serving through an HTTP action

Use this when the file needs an auth check, a custom `Content-Disposition`, or a stable path at `https://<deployment>.convex.site/files/<storageId>`. `ctx.storage.get` returns the `Blob`. Add the route to the router in `convex/http.ts`.

```typescript
// convex/http.ts
import { Id } from "./_generated/dataModel";

http.route({
  pathPrefix: "/files/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const storageId = new URL(request.url).pathname.slice("/files/".length) as Id<"_storage">;
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return new Response("Unauthorized", { status: 401 });

    const blob = await ctx.storage.get(storageId);
    if (!blob) return new Response("Not found", { status: 404 });
    return new Response(blob, {
      headers: { "Content-Type": blob.type || "application/octet-stream" },
    });
  }),
});
```

## Metadata from the _storage table

Read metadata with `ctx.db.system.get(storageId)` in any query or mutation, as `saveFile` does above. `ctx.storage.getMetadata` is deprecated and should not appear in new code. The document shape:

```typescript
type StorageDoc = {
  _id: Id<"_storage">;
  _creationTime: number;
  contentType?: string; // from the upload's Content-Type header or blob.type
  sha256: string;
  size: number; // bytes
};
```

The matching validator is `v.object({ _id: v.id("_storage"), _creationTime: v.number(), contentType: v.optional(v.string()), sha256: v.string(), size: v.number() })`. `ctx.db.system.query("_storage")` lists every stored file, useful for finding orphans that no `files` row points to.

## Deleting

Delete the blob and the row in the same mutation so neither is orphaned. Check ownership on the row, not by trusting the client. If several rows can share one `storageId`, only delete the blob when the last reference goes.

```typescript
// convex/files.ts
export const remove = mutation({
  args: { fileId: v.id("files") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const file = await ctx.db.get(args.fileId);
    if (!file) return null; // idempotent: already gone
    if (file.ownerId !== user._id) throw new Error("Not allowed");

    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(args.fileId);
    return null;
  },
});
```

## Common mistakes

| Mistake | Why it breaks | Do instead |
| --- | --- | --- |
| Saving the URL from `getUrl` or the upload URL in a document | Upload URLs expire in an hour; stored URLs go stale after deletes | Store `Id<"_storage">`, resolve with `getUrl` in the query |
| `v.string()` for the storage id | Loses type safety, accepts garbage | `v.id("_storage")` |
| Calling `ctx.storage.store` in a mutation | Not available there | Use an action or HTTP action, then `runMutation` to save |
| Skipping `Content-Type` on the upload POST | File serves as `application/octet-stream`, images will not render inline | Set `headers: { "Content-Type": file.type }` |
| Validating size and type only in the browser | Anyone can POST to the upload URL directly | Check again with `ctx.db.system.get` in the save mutation |
| `ctx.storage.getMetadata(id)` | Deprecated | `ctx.db.system.get(id)` |
| Deleting the `files` row but not the blob | Storage bill keeps growing | Delete both in one mutation |
| Uploading large files through an HTTP action | 20MB request cap | Use the upload URL flow |

## Checklist

- [ ] Schema stores `v.id("_storage")` plus app level name, type, size, and owner
- [ ] `generateUploadUrl` requires a signed in user, and the client POSTs with `Content-Type: file.type`
- [ ] Save mutation validates size and content type again via `ctx.db.system.get` and deletes rejected uploads
- [ ] Queries return `url` from `ctx.storage.getUrl` and the UI handles `null`
- [ ] Actions use `ctx.storage.store(blob)` with a correct `type`, then `runMutation` to save the reference
- [ ] HTTP serving route checks auth before `ctx.storage.get`
- [ ] Delete mutation removes the blob and the row together and is idempotent
- [ ] No `ctx.storage.getMetadata` calls and no URL strings persisted in the database

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/file-storage/upload-files
- https://docs.convex.dev/file-storage/serve-files
- https://docs.convex.dev/file-storage/file-metadata
