---
name: what-i-need-from-you
description: 'Ends every agent turn with a clear "What I need from you" section listing concrete actions the user must take, or says "Nothing needed from you right now", and logs every ask by id and session in prds/what-i-need-from-you.md. Use on every turn, especially when blocked on the user, when the next step needs a login, dashboard, key rotation, decision, file, or approval, or when finishing a task, audit, or fix.'
---

# What you need from me

- End every turn where you're blocked on me, or where the next step needs me, with a short
"**What I need from you**" section. Numbered, one concrete action per item: exactly what to do,
where (which site, app, file or person), and what to send back. e.g. "Log into CommBank NetBank
and export Jan to Jun 2026 as CSV, then drop it in `inbox/`", not "I need the bank data".
- If there are several, put the quickest or most blocking one first, and say what you'll get on
with in the meantime.
- If you don't need anything from me, say "Nothing needed from you right now" so I don't have to
ask.
- Never bury a request for me in the middle of a long update.

## Format

```markdown
**What I need from you**

1. A1 (do): [Action] in [site, app, file, or person], then send back [result].
2. ...

Meanwhile I'll [what you work on while waiting].
```

Put the section last in the reply. Never ask for a secret value: ask the user to paste it into the dashboard or env var, then confirm it is set.

## Kinds of ask

Tag each item with one kind, in the reply and the log:

| Kind | Means | Rule |
| --- | --- | --- |
| do | The user acts somewhere you cannot (dashboard, login, 2FA, payment page) | Say the exact page and what to send back |
| decide | A choice only the user can make (keep or archive, which provider) | Offer the options and your pick, ask for one word back |
| approve | You can do it, but it spends money, deletes data, publishes, or touches prod | Say what it costs or what cannot be undone, then wait for an explicit "yes A4". Auto approve mode or an earlier "go ahead" does not count |

Declined is an answer. If the user says no or skips an ask, mark it declined in the log and do not ask again unless something changed. Then say what changed.

## Track it in prds/what-i-need-from-you.md

Every turn that uses this skill also updates `prds/what-i-need-from-you.md` in the project root. Create the `prds/` folder and the file if they are missing.

1. Give each new ask the next id (`A1`, `A2`, ...). Never reuse an id, so the user can reply "A3 done".
2. Add new asks to the **Open** table: id, kind, action, where, send back, steps link, date asked.
3. When the user reports one done, or you confirm it, move its row to **Done** with the date. A declined ask moves to Done too, with "declined" and the reason.
4. Add a **Session log** entry at the top of that section, even when nothing changed:

```markdown
### YYYY-MM-DD H:MM AM/PM: short name of the prompt

* Asked: A9, A10 (or "none new")
* Closed: A2 (or "none")
* Changed: one line on what the turn did
```

5. Keep the reply's "What I need from you" list and the Open table in sync, using the same ids.

File layout, in order: title and one line on how to use it, `## Open`, `## Done`, `## Session log` (newest first).

If the project also keeps a task file such as `task-repos.md`, put its "What I need from you" section first in that file and link it to the log.
