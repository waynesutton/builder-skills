# State machine problems

What to look for in each machine, how to spot it, and the fix. Mark each one in the report as security, bug, or design.

## Contents

- Problems
- The transition helper
- A Convex example
- A test for a move out of order

## Problems

| Problem | How to spot it | Kind | Fix |
| --- | --- | --- | --- |
| Status from the client | A mutation takes `status` (or a boolean flag) in args and writes it | security | Named mutations that set a fixed status |
| No check of the current state | A writer patches the field without reading it first, or reads it and ignores it | security when public, bug when internal | Assert the move against the map before the write |
| Skipped step | A writer goes straight to a late state (`draft` to `shipped`) | bug, security when it skips payment or approval | Assert the move against the map |
| Wrong actor | Any signed in user can make a move meant for the owner, an admin, or a webhook | security | Owner or role check from the database; money moves internal |
| One time move runs twice | Refund, payout, redeem, claim, or send with no "already done" check, or the check in an action and the write in a later mutation | security or bug | Check and set in one mutation; early return when already done |
| Side effect before the commit | The client sends the email or starts the job, or an action does the side effect and then calls the mutation | bug | Schedule the side effect from the mutation that makes the move |
| Impossible combination | Two booleans that can both be true (`isApproved` and `isRejected`), or `paidAt` set while `status` is `draft` | bug | One status field, or reject the pair on write |
| Dead state | A state no writer ever sets | design | Remove it, or add the missing move |
| Stuck state | A state with no way out that is not meant to be final (`processing` after a failed job) | bug | Add the failure move, a timeout cron, or a retry |
| No way back | A user cannot undo or cancel a move they should be able to | design | Add the move to the map, with its actor |
| Drift between validator and code | A literal written in code that the schema does not list, or the reverse | bug | One union of literals, used by the schema and the map |
| Two sources of truth | The same lifecycle stored on two tables, or as a field and a derived copy | bug | One owner; update copies in the same mutation |
| Racing writers | A cron and a user mutation both move the same row with no check | bug | Each one asserts the move, so the loser throws or returns early |

## The transition helper

One map, one helper. Every writer calls it.

```ts
// convex/lib/transitions.ts
import { ConvexError } from "convex/values";

const transitions = {
  draft: ["pending"],
  pending: ["paid", "cancelled"],
  paid: ["refunded"],
  cancelled: [],
  refunded: [],
} as const;

export type OrderStatus = keyof typeof transitions;

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!(transitions[from] as readonly OrderStatus[]).includes(to)) {
    throw new ConvexError({ code: "INVALID_TRANSITION", from, to });
  }
}
```

Keep the schema in step with the map:

```ts
// convex/schema.ts
status: v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("paid"),
  v.literal("cancelled"),
  v.literal("refunded"),
),
```

## A Convex example

Before. One generic setter, public, no check:

```ts
export const setStatus = mutation({
  args: { orderId: v.id("orders"), status: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, { status: args.status });
  },
});
```

After. A named move for the owner, and an internal move for the payment webhook. The early return makes a replayed webhook harmless. The receipt is scheduled from the mutation, so it is sent only if the move commits.

```ts
// convex/orders.ts
import { v, ConvexError } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertTransition } from "./lib/transitions";

export const submit = mutation({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const order = await ctx.db.get(args.orderId);
    // Same error for missing and not owned
    if (!order || order.ownerTokenIdentifier !== identity.tokenIdentifier) {
      throw new ConvexError({ code: "NOT_FOUND" });
    }
    assertTransition(order.status, "pending");
    await ctx.db.patch(args.orderId, { status: "pending" });
    return null;
  },
});

export const markPaid = internalMutation({
  args: { orderId: v.id("orders"), paymentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "NOT_FOUND" });
    // Replayed event: already paid, do nothing and send nothing
    if (order.status === "paid") return null;
    assertTransition(order.status, "paid");
    await ctx.db.patch(args.orderId, { status: "paid", paymentId: args.paymentId });
    await ctx.scheduler.runAfter(0, internal.emails.sendReceipt, { orderId: args.orderId });
    return null;
  },
});
```

## A test for a move out of order

With `convex-test` and Vitest. Seed a row in one state, call a move the map does not allow, and expect it to throw.

```ts
// convex/orders.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("a draft order cannot be marked paid", async () => {
  const t = convexTest(schema, modules);
  const orderId = await t.run((ctx) =>
    ctx.db.insert("orders", { status: "draft", ownerTokenIdentifier: "issuer|a" }),
  );
  await expect(
    t.mutation(internal.orders.markPaid, { orderId, paymentId: "pay_1" }),
  ).rejects.toThrow();
});
```
