# Security policy

Starter from builder-skills. The `sec-check` skill reads this file before judging anything, so surfaces that are public on purpose stop showing up as findings and real invariants get checked. Keep it short and true. Never put secrets or exploit steps in it. Replace every bracketed part.

## Reporting

Email [security@example.com], or open a private advisory on GitHub. Please do not open a public issue.

## System and scope

[What the app does, where it runs (Convex deployment, Vercel or Netlify frontend), and which parts are in scope.]

## Who can do what

| Actor | Starts with | Must never get |
| --- | --- | --- |
| Signed out visitor | Public pages, functions marked `sec-check: public` | Any write except the rate limited ones listed below, any private row |
| Signed in user | Their own rows | Other users' rows, admin functions, the owner's provider keys |
| Admin | Role from the users table | Nothing beyond the app. Deploy keys stay in the host dashboard |
| Webhook sender | A signed request | Any write before the signature checks |

## Public by design

- [`posts:listPublic` returns published posts with a projection.]
- [`waitlist:join` is anonymous, rate limited per IP.]

## Invariants

- Identity comes from `ctx.auth`, never from args.
- Every paid call runs behind auth or an IP limit plus a global ceiling.
- Storage URLs go only to callers who passed the row's access check.

## Out of scope and accepted risk

Owner confirmed only, with the reason and a date. Example: "YYYY-MM-DD: like counts can be inflated by signed in users. Low value, revisit if likes affect ranking."
