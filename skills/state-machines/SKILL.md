---
name: state-machines
description: "Finds the implicit state machines in an app: status, state, stage, phase, and step fields, groups of booleans that act like one status, and flows spread across UI, mutations, webhooks, and scheduled jobs. Reports every state, every function that moves it, who can trigger each move, and the problems, then proposes an explicit transition map. Report only by default. Use when the user says find the implicit state machines, audit status fields, map the order or onboarding flow, or when a status bug, a skipped step, or a double run refund, payout, or email shows up."
---

# State machines

An implicit state machine is a field, or a group of fields, that moves through stages with no written list of allowed moves. The list exists anyway. It is spread across every function that writes the field, and nobody has read it in one place.

This skill reads it in one place. It writes a report. It changes no code until the user picks a machine to fix.

Most of what it finds is product design and bugs. The part an attacker can use belongs to `sec-check` rule 21.

## What counts

- A field named `status`, `state`, `stage`, `phase`, or `step` (draft, pending, paid, shipped, refunded).
- A group of booleans that act like one status: `isPaid`, `isApproved`, `isRejected`, `isPublished`.
- A timestamp that doubles as a flag: `paidAt`, `deletedAt`, `completedAt`, `verifiedAt`.
- A flow spread across UI, mutations, webhooks, and scheduled jobs: onboarding, checkout, invites, approvals, AI jobs, uploads.

## Run the audit

Work at the repo root with the whole repo open. On a Convex app, start with `convex/schema.ts`, then `convex/**/*.ts`, `convex/http.ts`, and `convex/crons.ts`.

1. **Find the fields.** Search the schema and types:

   ```bash
   rg -n "\b(status|state|stage|phase|step)\b\s*[:=]" convex src --glob '!**/_generated/**'
   rg -n "\bis[A-Z]\w+:\s*v\.(boolean|optional)" convex/schema.ts
   rg -n "\w+At:\s*v\.(number|optional)" convex/schema.ts
   ```

   Group booleans and timestamps on the same table that describe one lifecycle. Each group is one machine.

2. **List the states.** Read the validator (`v.union(v.literal(...))`) and every literal written in code. A value written in code but missing from the validator, or the reverse, is a finding.

3. **Find every writer.** For each machine, list every `ctx.db.patch`, `ctx.db.insert`, and `ctx.db.replace` that sets the field. Search by field name, not by table. Include webhooks, crons, scheduled functions, and migrations. For each writer record the move: from which states (what it checks before writing, or "any" when it checks nothing) and to which state.

4. **Find who can trigger each move.** Public, signed in, owner, admin, verified webhook, or internal. A public function that calls an internal one makes the move public.

5. **Find the side effects.** Emails, payments, payouts, AI calls, and scheduled jobs tied to a move. Note whether each one runs in the mutation that makes the move, before it, or from the client.

6. **Check for problems.** Use [references/problems.md](references/problems.md). It lists each problem, how to spot it, and the fix.

7. **Write the report.** Use the format below. Order machines by risk: money, access, and one time moves first.

8. **Stop.** Do not edit code. Ask which machine to fix first.

## Report format

```markdown
# State machines: PROJECT

Found N machines. M have problems. Date, commit.

## 1. orders.status

States: draft, pending, paid, cancelled, refunded
Lives in: `orders` (convex/schema.ts:42)

| Move | Function | Who can trigger | Checks current state | Side effects |
| --- | --- | --- | --- | --- |
| draft -> pending | orders:submit (public mutation) | owner | yes | none |
| any -> paid | orders:setStatus (public mutation) | any signed in user | no | receipt email, from the client |

Problems:
1. `orders:setStatus` takes the new status from args. Any signed in user can mark an order paid. Security: sec-check rule 21.
2. Nothing moves `pending` to `cancelled`. Abandoned orders stay pending forever.

Proposed transition map:

    draft: [pending]
    pending: [paid, cancelled]
    paid: [refunded]
    cancelled: []
    refunded: []

Fixes, in order:
1. Replace `setStatus` with named mutations. `markPaid` becomes internal, called by the verified webhook.
2. Add a cron that cancels orders pending for more than 24 hours.
```

Mark each problem as security, bug, or design. Say "none found" for a clean machine and keep it in the report, so the next run can compare.

## Fixing a machine

Only after the user picks one. Fix one machine at a time.

1. Type the field as a union of literals in the schema, so a typo cannot add a state.
2. Put the allowed moves in one map with one helper that throws on a move not in the map. The helper and a full Convex example are in [references/problems.md](references/problems.md).
3. Replace generic setters with named mutations that set a fixed status.
4. Move the read, the check, and the write into one mutation. A Convex mutation is a transaction, so the check and the write cannot be split by another caller.
5. Schedule side effects from the mutation that makes the move. A function scheduled from a mutation runs only if the mutation commits.
6. If existing rows hold states the new map does not allow, plan a migration before tightening the validator. Use the official Convex migration skills for that.
7. Add a test that calls a move out of order and expects it to throw.

For Convex APIs, check https://docs.convex.dev/llms.txt before relying on memory.

## Hand offs

| Found | Goes to |
| --- | --- |
| A move an attacker can make with `curl`, or a one time move that runs twice | `sec-check` rule 21, with the start state, the call, and the end state |
| A fix that touches three or more files or the schema | `create-prd` |
| The fix landed | `update-project-docs` |
| The audit turns up ideas beyond the machine being fixed | `avoid-feature-creep`: list them, do not build them |

## Never

- Change code during the audit. The report comes first.
- Invent a state or a move the code does not show. Quote the file and line for every writer.
- Call a design gap a security finding. It needs a reachable bad move.
- Fix several machines in one change.
