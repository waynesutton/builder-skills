---
name: convex-agents
description: "Builds AI agents on the Convex agent component: threads, messages, tools that call queries and mutations, streaming, RAG with vector search, and workflows for multi step jobs. Use when adding a chat assistant, tool calling agent, or retrieval feature to a Convex app."
---

# Convex agents

Produces a chat or tool calling agent backed by `@convex-dev/agent`, with thread history stored in Convex and a reactive message list for the UI. The one rule: every LLM call runs inside an action. Mutations save the prompt and schedule the action; they never call a model.

## When to reach for this

- Adding a chat assistant with persistent conversation history
- Letting an LLM call your queries and mutations as tools
- Streaming a model reply to one or more clients
- Answering questions over your own documents (RAG)
- Chaining several LLM steps into a durable job that survives restarts

## Install and register

```bash
npm install @convex-dev/agent ai @ai-sdk/openai zod
npx convex env set OPENAI_API_KEY sk-...
```

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp();
app.use(agent);
export default app;
```

Run `npx convex dev` once so `components.agent` is generated before defining an agent.

## Define an agent

```typescript
// convex/agent.ts
import { Agent, stepCountIs } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { components } from "./_generated/api";

export const supportAgent = new Agent(components.agent, {
  name: "Support Agent",
  languageModel: openai.chat("gpt-4o-mini"),
  instructions: "You are a support assistant. Answer briefly and cite docs when possible.",
  // Lets the model call tools and then respond, up to 5 steps
  stopWhen: stepCountIs(5),
});
```

`name` tags each saved message with the agent that wrote it. Everything except `name` can be overridden per call.

## Create a thread and generate a reply

Save the user prompt in a mutation, then schedule an internal action that generates the reply. Clients subscribed to the thread see the new message without the action returning anything.

```typescript
// convex/chat.ts
import { v } from "convex/values";
import { mutation, internalAction, QueryCtx, MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { saveMessage } from "@convex-dev/agent";
import { supportAgent } from "./agent";

// Throws unless the signed in user owns the thread
async function authorizeThreadAccess(ctx: QueryCtx | MutationCtx, threadId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const thread = await ctx.runQuery(components.agent.threads.getThread, { threadId });
  if (!thread || thread.userId !== identity.subject) throw new Error("Unauthorized");
}

export const startThread = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const { threadId } = await supportAgent.createThread(ctx, { userId: identity.subject });
    return threadId;
  },
});

export const sendMessage = mutation({
  args: { threadId: v.string(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await authorizeThreadAccess(ctx, args.threadId);
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      prompt: args.prompt,
    });
    await ctx.scheduler.runAfter(0, internal.chat.generateReply, {
      threadId: args.threadId,
      promptMessageId: messageId,
    });
    return null;
  },
});

export const generateReply = internalAction({
  args: { threadId: v.string(), promptMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // promptMessageId makes retries safe: the same prompt is reused, never duplicated
    await supportAgent.generateText(
      ctx,
      { threadId: args.threadId },
      { promptMessageId: args.promptMessageId },
    );
    return null;
  },
});
```

Thread ids are strings, not `v.id(...)`, since the table lives inside the component.

## List messages for the UI

```typescript
// convex/chat.ts (continued)
import { paginationOptsValidator } from "convex/server";
import { listUIMessages } from "@convex-dev/agent";
import { query } from "./_generated/server";

export const listMessages = query({
  args: { threadId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await authorizeThreadAccess(ctx, args.threadId);
    return await listUIMessages(ctx, components.agent, args);
  },
});
```

```tsx
// src/Chat.tsx
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "../convex/_generated/api";

function Chat({ threadId }: { threadId: string }) {
  const { results, status, loadMore } = useUIMessages(
    api.chat.listMessages,
    { threadId },
    { initialNumItems: 20 },
  );
  return (
    <div>
      {results.map((m) => (
        <div key={m.key} data-role={m.role}>{m.text}</div>
      ))}
      {status === "CanLoadMore" && <button onClick={() => loadMore(20)}>Older</button>}
    </div>
  );
}
```

`listUIMessages` merges tool calls and the assistant text that follows them into one `UIMessage`, which keeps rendering simple.

## One tool

Tools are defined with `createTool` and get a `ctx` that includes `runQuery`, `runMutation`, `userId`, and `threadId`. Annotate the handler return type to avoid circular type errors.

```typescript
// convex/tools.ts
import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { api } from "./_generated/api";

export const searchOrders = createTool({
  description: "Find the current user's orders that match a search term",
  args: z.object({
    term: z.string().describe("Product name or order number to look for"),
  }),
  handler: async (ctx, args): Promise<Array<{ id: string; status: string }>> => {
    return await ctx.runQuery(api.orders.search, { term: args.term });
  },
});
```

Pass it to the agent with `tools: { searchOrders }` in the constructor or at the call site. For tool error handling, runtime tools with closures, and delta streaming to the client, open [references/tools-and-streaming.md](references/tools-and-streaming.md).

## Retrieval and multi step jobs

For embedding documents, searching them with `@convex-dev/rag` or a hand rolled vector index, injecting results into the prompt, and running several LLM steps as a durable `@convex-dev/workflow` job, open [references/rag-and-workflows.md](references/rag-and-workflows.md).

## Common mistakes

| Mistake | Why it breaks | Do instead |
| --- | --- | --- |
| Calling `generateText` in a mutation | Mutations cannot make network calls and must be deterministic | Save the prompt with `saveMessage`, schedule an `internalAction` |
| `v.id("threads")` for thread ids | The threads table lives in the component, so ids are strings outside it | Use `v.string()` |
| Skipping `npx convex dev` after `app.use(agent)` | `components.agent` is not generated, so types fail | Run dev once before writing agent code |
| Returning the reply text from the action to the client | Loses the reply if the client disconnects, no reactivity | Let clients read `listUIMessages`; the saved message shows up on its own |
| Tools without `.describe()` on args | The model guesses what each field means and calls tools badly | Describe every zod field |
| Tool handler with no return type annotation | TypeScript circularity errors from `ctx.runQuery` | Add `: Promise<...>` to the handler |
| Exposing the message query with no auth check | Any client can read any thread | Call an `authorizeThreadAccess` helper first |
| `stopWhen` left at the default with tools defined | The model calls a tool and stops without a text reply | Set `stopWhen: stepCountIs(n)` with `n > 1` |

## Checklist

- [ ] `app.use(agent)` in `convex.config.ts` and `npx convex dev` has run
- [ ] Provider key stored with `npx convex env set`, never in client code
- [ ] `Agent` has a `name`, `languageModel`, and `instructions`
- [ ] Prompts saved in a mutation, replies generated in an `internalAction` with `promptMessageId`
- [ ] Thread and message ids typed as `v.string()`
- [ ] Message list query checks thread ownership before calling `listUIMessages`
- [ ] Every tool arg has a zod `.describe()` and the handler has a return type
- [ ] `stopWhen: stepCountIs(n)` set when tools are in play
- [ ] Client uses `useUIMessages` rather than reading action return values

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/agents
- https://docs.convex.dev/agents/agent-usage
- https://docs.convex.dev/agents/tools
- https://www.convex.dev/components/agent
