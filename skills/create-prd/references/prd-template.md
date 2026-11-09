# PRD template

Copy this into `prds/<slug>.md`. Delete sections that do not apply. Keep it under two screens.

```markdown
# <Feature or problem, sentence case>

Created: YYYY-MM-DD HH:mm UTC
Last Updated: YYYY-MM-DD HH:mm UTC
Status: Draft

## Problem

One paragraph. Who hits it, what happens, why it matters now.

## Root cause

Bugs only. The specific line, query, or design decision that produces the problem. If unknown, say so and list the two most likely candidates.

## Proposed solution

What changes and why this approach over the alternatives. Two or three sentences per major decision.

## Files to change

- `path/to/file.ts` what changes here
- `path/to/other.tsx` what changes here
- new: `path/to/new.ts` what it does

## Edge cases

- Empty state
- Concurrent writes
- Auth missing or expired
- Existing data that does not match the new shape

## Verification steps

Commands or clicks that prove it works. Each one has an expected result.

1. `npx convex dev` runs clean, no schema errors
2. `npm run typecheck` passes
3. Open /page, do X, see Y
4. Dashboard shows no OCC retries on `mutationName` after 5 minutes of use

## Out of scope

Things that came up and were deliberately not done. Link an issue or a new PRD if they should happen later.

## Task completion log

- YYYY-MM-DD HH:mm UTC Started. Triage notes.
- YYYY-MM-DD HH:mm UTC Schema and mutation done. Verified step 1 and 2.
- YYYY-MM-DD HH:mm UTC UI wired. Verified step 3. Status: Done.
```

## Notes on filling it in

- Problem before solution. If the problem section is thin, the solution is a guess.
- Files to change is the scope contract. If a file is not listed and needs to change, update the PRD first.
- Verification steps are what moves a task to Completed. Write them so someone else could run them.
- Out of scope is where feature creep goes to wait.
- The completion log is append only. Do not rewrite history.
