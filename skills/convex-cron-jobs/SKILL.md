---
name: convex-cron-jobs
description: "Schedules work in Convex: cron jobs in convex/crons.ts, one off scheduled functions with runAfter and runAt, batching large jobs, and cancelling or inspecting the queue. Use when something needs to run on a timer, later, or in the background, or when a cron is not firing."
---

# Convex cron jobs and scheduling

Recurring work lives in `convex/crons.ts`. One off work is scheduled from inside a function with `ctx.scheduler`. Both must target `internal.*` functions, never `api.*`.

## When to reach for this

- Something needs to run every N minutes or at a fixed time of day
- A mutation needs to kick off follow up work after it commits
- A job touches more rows than one mutation should handle
- A cron shows in the dashboard but never runs, or runs at the wrong hour
- A pending job needs to be cancelled, debounced, or inspected

Deeper material lives in two reference files:

- [references/scheduling-patterns.md](references/scheduling-patterns.md): open when you need retry with backoff, cancelling a job, reading `_scheduled_functions`, debouncing, or local time zones.
- [references/cron-recipes.md](references/cron-recipes.md): open for short copyable jobs: daily digest email, session expiry, stats rollup, external API sync.

## crons.ts skeleton

One file, one default export. `crons.interval` for "every N", `crons.cron` for calendar times. `crons.daily`, `crons.hourly`, and `crons.weekly` are deprecated helpers. Do not use them.

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every hour
crons.interval(
  "expire sessions",
  { hours: 1 },
  internal.sessions.expireBatch,
  {},
);

// Every day at 09:00 UTC. Cron expressions are always UTC.
crons.cron("daily digest", "0 9 * * *", internal.digest.send, {});

export default crons;
```

Rules for every entry:

- Names are unique within the file. The dashboard lists jobs by this name.
- Import `internal` from `./_generated/api`, even when the target is defined in `crons.ts`.
- Args are static and must satisfy the target function's `args` validator.
- Interval units are `{ seconds }`, `{ minutes }`, or `{ hours }`.

Cron expression quick reference (minute hour day-of-month month day-of-week):

| Expression | Runs |
| --- | --- |
| `*/15 * * * *` | every 15 minutes |
| `0 * * * *` | every hour at :00 |
| `0 0 * * *` | daily at 00:00 UTC |
| `0 8 * * 1` | Mondays at 08:00 UTC |
| `0 0 1 * *` | first of each month |
| `0 9-17 * * 1-5` | hourly, 09:00 to 17:00 UTC, weekdays |

## Targets are internal functions

Public functions expect a client, an auth identity, and untrusted input. Cron and scheduler calls have none of that. A public target skips the auth checks you wrote and exposes the job to anyone who can reach the deployment. Register targets with `internalMutation`, `internalAction`, or `internalQuery`.

## One batched job

A mutation is one transaction with read and write limits. Deleting fifty thousand rows in a loop hits them. Take a fixed slice, reschedule yourself with `runAfter(0, ...)`, and let the chain finish on its own.

```typescript
// convex/sessions.ts
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const BATCH = 100;

export const expireBatch = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Date.now() is fine in a mutation. Never call it in a query.
    const now = Date.now();
    const expired = await ctx.db
      .query("sessions")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(BATCH);

    await Promise.all(expired.map((s) => ctx.db.delete(s._id)));

    // A full batch means more may remain. Chain the next one.
    if (expired.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.sessions.expireBatch, {});
    }
    return null;
  },
});
```

This shape works because each delete removes the row from the index range. If the job updates rows without moving them out of the range, use a pagination cursor instead. See the reference file.

## runAfter vs runAt

```typescript
// Relative: 5 minutes from now
const jobId = await ctx.scheduler.runAfter(
  5 * 60 * 1000,
  internal.reminders.send,
  { taskId: args.taskId },
);

// Absolute: a timestamp you already store (ms since epoch or a Date)
await ctx.scheduler.runAt(trial.endsAt, internal.billing.endTrial, {
  userId: trial.userId,
});
```

| Method | Use for |
| --- | --- |
| `runAfter(delayMs, fn, args)` | retries, follow ups, "in ten minutes" |
| `runAt(timestamp, fn, args)` | trial ends, send dates, anything with a stored time |

Both return an `Id<"_scheduled_functions">`. Store it on a document if you may need to cancel.

Two behaviors to remember:

- Scheduling inside a mutation is transactional. If the mutation throws, nothing is scheduled. Scheduling inside an action happens right away, even if the action fails later.
- Scheduled mutations run exactly once. Scheduled actions may fail without retry, so add retry logic to actions or use a retry component.

## Seeing runs in the dashboard

- Schedules, Cron Jobs tab: every entry from `crons.ts`, with last run and next run.
- Schedules, Scheduled Functions tab: pending `runAfter` and `runAt` jobs.
- Logs, filtered by function name: each execution, its duration, and any thrown error.
- From the CLI: `npx convex logs` streams the same log lines.
- From code: `ctx.db.system.get(jobId)` returns the job document with `state.kind` set to `pending`, `inProgress`, `success`, `failed`, or `canceled`.

## When a cron is not firing

1. The file is exactly `convex/crons.ts` and ends with `export default crons`.
2. `npx convex dev` is running and the last push succeeded. Cron changes only apply on push.
3. The target is `internal.*` and the args match its validator. A mismatch fails at push time.
4. The expression is UTC. Convert your local hour before comparing.
5. Check Logs for a thrown error. A job that throws every run looks like a job that never runs.

## Common mistakes

| Mistake | Why it breaks | Do instead |
| --- | --- | --- |
| `crons.daily(...)` | deprecated helper | `crons.cron("...", "0 0 * * *", ...)` |
| Target is `api.tasks.cleanup` | skips auth, publicly callable | register as `internalMutation`, use `internal.tasks.cleanup` |
| `.collect()` then loop over thousands | hits transaction limits | `take(BATCH)` and reschedule |
| `.withIndex("by_x").filter(...)` | filter scans the whole index | put the range in `withIndex` |
| `Date.now()` in an `internalQuery` | breaks caching and reactivity | pass `now` as an arg from the caller |
| Cron at `"0 9 * * *"` for 9am Pacific | runs at 9am UTC | use UTC, or run hourly and check local hour |
| Missing `await` on `runAfter` | job may not be scheduled | always `await ctx.scheduler.*` |
| Two crons with the same name | push fails | unique names per file |

## Checklist

- [ ] `convex/crons.ts` uses only `crons.interval` and `crons.cron`, ends with `export default crons`
- [ ] Every cron and scheduler target is `internal.*`
- [ ] Every target has `args` and `returns` validators
- [ ] Jobs that touch many rows take a batch and reschedule with `runAfter(0, ...)`
- [ ] Range conditions live in `withIndex`, not `.filter`
- [ ] No `Date.now()` inside queries
- [ ] Every `ctx.scheduler.*` call is awaited
- [ ] Cron hours are written in UTC
- [ ] Job ids are stored on documents when cancel or debounce is needed
- [ ] Ran `npx convex dev` and saw the job listed under Schedules

## Docs

- https://docs.convex.dev/llms.txt
- https://docs.convex.dev/scheduling/cron-jobs
- https://docs.convex.dev/scheduling/scheduled-functions
- https://docs.convex.dev/database/advanced/system-tables
