---
name: convex-file-storage
displayName: Convex File Storage
description: Complete file handling including upload flows, serving files via URL, storing generated files from actions, deletion, and accessing file metadata from system tables
version: 1.37.0
author: Convex
tags: [convex, file-storage, uploads, images, files]
last-updated: 2026-05-04
---

# Convex File Storage

Handle file uploads, storage, serving, and management in Convex applications with proper patterns for images, documents, and generated files.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/file-storage
- Upload Files: https://docs.convex.dev/file-storage/upload-files
- Serve Files: https://docs.convex.dev/file-storage/serve-files
- Delete Files: https://docs.convex.dev/file-storage/delete-files
- File Metadata: https://docs.convex.dev/file-storage/file-metadata
- Store Files: https://docs.convex.dev/file-storage/store-files
- For broader context: https://docs.convex.dev/llms.txt

## Instructions

### File Storage Overview

Convex provides built-in file storage with:
- Automatic URL generation for serving files
- Support for any file type (images, PDFs, videos, etc.)
- File metadata via the `_storage` system table
- Integration with mutations and actions

### Generating Upload URLs

```typescript
// convex/files.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
```

Upload URLs expire in 1 hour - fetch them shortly before uploading to ensure validity.

### Client-Side Upload

```typescript
// React component
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState } from "react";

function FileUploader() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveFile = useMutation(api.files.saveFile);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Step 1: Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Step 2: Upload file to storage
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const { storageId } = await result.json();

      // Step 3: Save file reference to database
      await saveFile({
        storageId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={handleUpload}
        disabled={uploading}
      />
      {uploading && <p>Uploading...</p>}
    </div>
  );
}
```

### Saving File References

```typescript
// convex/files.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const saveFile = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("files", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      uploadedAt: Date.now(),
    });
  },
});
```

### Serving Files via URL

```typescript
// convex/files.ts
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Get file with URL
export const getFile = query({
  args: { fileId: v.id("files") },
  returns: v.union(
    v.object({
      _id: v.id("files"),
      fileName: v.string(),
      fileType: v.string(),
      fileSize: v.number(),
      url: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) return null;

    const url = await ctx.storage.getUrl(file.storageId);
    
    return {
      _id: file._id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      url,
    };
  },
});
```

### Displaying Files in React

```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function FileDisplay({ fileId }: { fileId: Id<"files"> }) {
  const file = useQuery(api.files.getFile, { fileId });

  if (!file) return <div>Loading...</div>;
  if (!file.url) return <div>File not found</div>;

  // Handle different file types
  if (file.fileType.startsWith("image/")) {
    return <img src={file.url} alt={file.fileName} />;
  }

  if (file.fileType === "application/pdf") {
    return (
      <iframe
        src={file.url}
        title={file.fileName}
        width="100%"
        height="600px"
      />
    );
  }

  return (
    <a href={file.url} download={file.fileName}>
      Download {file.fileName}
    </a>
  );
}
```

### Storing Generated Files from Actions

```typescript
// convex/generate.ts
"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const generatePDF = action({
  args: { content: v.string() },
  returns: v.id("_storage"),
  handler: async (ctx, args) => {
    // Generate PDF (example using a library)
    const pdfBuffer = await generatePDFFromContent(args.content);

    // Convert to Blob
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });

    // Store in Convex
    const storageId = await ctx.storage.store(blob);

    return storageId;
  },
});

// Generate and save image
export const generateImage = action({
  args: { prompt: v.string() },
  returns: v.id("_storage"),
  handler: async (ctx, args) => {
    // Call external API to generate image
    const response = await fetch("https://api.example.com/generate", {
      method: "POST",
      body: JSON.stringify({ prompt: args.prompt }),
    });

    const imageBuffer = await response.arrayBuffer();
    const blob = new Blob([imageBuffer], { type: "image/png" });

    return await ctx.storage.store(blob);
  },
});
```

### Uploading Files via HTTP Action

For tighter control over uploads (files under 20MB), use HTTP actions:

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

http.route({
  path: "/uploadFile",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Step 1: Store the file
    const blob = await request.blob();
    const storageId = await ctx.storage.store(blob);

    // Step 2: Save the storage ID to the database via a mutation
    const author = new URL(request.url).searchParams.get("author");
    if (author === null) {
      return new Response("Author is required", {
        status: 400,
      });
    }

    await ctx.runMutation(api.files.saveFile, { storageId, author });

    // Step 3: Return a response with the correct CORS headers
    return new Response(null, {
      status: 200,
      headers: new Headers({
        "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN!,
        Vary: "origin",
      }),
    });
  }),
});

// Pre-flight request for /uploadFile
http.route({
  path: "/uploadFile",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN!,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Digest",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});
```

### Serving Files via HTTP Action

For access control at serve time (files under 20MB), serve from HTTP actions:

```typescript
// convex/http.ts
http.route({
  path: "/getFile",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const { searchParams } = new URL(request.url);
    const storageId = searchParams.get("storageId")! as Id<"_storage">;

    const blob = await ctx.storage.get(storageId);
    if (blob === null) {
      return new Response("File not found", {
        status: 404,
      });
    }

    return new Response(blob);
  }),
});
```

### Accessing File Metadata

```typescript
// convex/files.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const getFileMetadata = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(
    v.object({
      _id: v.id("_storage"),
      _creationTime: v.number(),
      contentType: v.optional(v.string()),
      sha256: v.string(),
      size: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await ctx.db.system.get("_storage", args.storageId);
  },
});

// List all files (for admin/debugging)
export const listAllFiles = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.system.query("_storage").collect();
  },
});
```

### Deleting Files

```typescript
// convex/files.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const deleteFile = mutation({
  args: { fileId: v.id("files") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) return null;

    // Delete from storage
    await ctx.storage.delete(file.storageId);

    // Delete database record
    await ctx.db.delete(args.fileId);

    return null;
  },
});
```

## Best Practices

- Never run `npx convex deploy` unless explicitly instructed
- Never run any git commands unless explicitly instructed
- Validate file types and sizes on the client before uploading
- Store file metadata (name, type, size) in your own table
- Use the `_storage` system table only for Convex metadata
- Delete storage files when deleting database references
- Use appropriate Content-Type headers when uploading
- Consider image optimization for large images
- Fetch upload URLs shortly before use (they expire in 1 hour)
- Use upload URLs for files larger than 20MB (HTTP actions limited to 20MB)
- Upload POST requests have a 2-minute timeout

## Common Pitfalls

1. **Not setting Content-Type header** - Files may not serve correctly
2. **Forgetting to delete storage** - Orphaned files waste storage
3. **Not validating file types** - Security risk for malicious uploads
4. **Large file uploads without progress** - Poor UX for users
5. **Using deprecated getMetadata** - Use `ctx.db.system.get("_storage", storageId)` instead
6. **Wrong metadata access pattern** - Must pass table name: `ctx.db.system.get("_storage", storageId)`
7. **Stale upload URLs** - Fetch URLs shortly before use (expire in 1 hour)
8. **HTTP action size limits** - Requests and responses limited to 20MB
9. **Missing CORS headers** - HTTP action uploads will fail without proper CORS configuration
10. **Not handling null blob** - `ctx.storage.get()` returns null for non-existent files

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- File Storage: https://docs.convex.dev/file-storage
- Upload Files: https://docs.convex.dev/file-storage/upload-files
- Serve Files: https://docs.convex.dev/file-storage/serve-files
- Delete Files: https://docs.convex.dev/file-storage/delete-files
- File Metadata: https://docs.convex.dev/file-storage/file-metadata
- Store Files: https://docs.convex.dev/file-storage/store-files
