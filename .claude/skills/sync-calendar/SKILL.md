---
name: sync-calendar
description: Pull upcoming Google Calendar events into vault/meetings/ and create/link vault/tasks/ for events that need prep or follow-up, using the server's existing Google Calendar OAuth connector. Use when the user runs /sync-calendar or asks to refresh tasks or meetings from their calendar.
---

# sync-calendar

Populates `vault/meetings/` from Google Calendar and, where an event
genuinely implies work to do (prep needed, a follow-up owed), creates or
updates a linked task in `vault/tasks/`. Read `../../CLAUDE.md` first for
the task file schema, the `relatedMeeting` field, and the dedup rule.

This is the read side of the server's Calendar connector
(`apps/server/src/auth/oauth-google.ts` +
`apps/server/src/connectors/calendar.ts`), which normally only polls a
rolling 24h window for live reminders. For a wider or historical window,
use the same script `enrich-vault` uses:

```
npm run calendar:range -w apps/server -- --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--q "search text"]
```

This prints matching events as JSON (title, start/end, attendee emails,
description, htmlLink, recurringEventId, eventId) without touching the live
reminder cache. Default window if the user doesn't specify one: today
through 14 days out. If `.credentials/google.json` doesn't exist, say so
plainly and stop — don't fabricate calendar data.

## Steps

1. **Load existing state.** List `vault/meetings/*.md` (dedup key: event
   title + start time, or filename `YYYY-MM-DD-<slug>.md`) and
   `vault/tasks/*.md`, reading frontmatter for existing `relatedMeeting.eventId`
   values and `source.externalId` values of the form `gcal:<eventId>`.

2. **Fetch events** via `calendar:range` for the window.

3. **Cache each event** into `vault/meetings/YYYY-MM-DD-<slug>.md` if not
   already present: frontmatter with `title`, `date`/`start`/`end`,
   `attendees`, `eventId`, `recurringEventId` (if any), `source: gcal`,
   `url` (htmlLink). Body: the event description verbatim if present.
   Update in place (don't duplicate) if the event already has a cached file
   but details changed (time moved, attendees changed).

4. **Decide which events need a task.** Not every calendar event warrants
   one — most are just informational. Create or update a task only when
   there's a real, identifiable action:
   - The event description or title explicitly asks for prep ("bring X",
     "review Y before this", "come prepared with...").
   - It's a recurring 1:1/sync where the user is clearly expected to have
     an update ready, and there's evidence of that in the description.
   - The user has an existing open task whose `relatedMeeting.eventId`
     should now point at this event (link, don't duplicate).
   Do not create a task just because a meeting exists on the calendar.

5. **For events that need a task**, gather everything needed for a
   **complete** task (see Completeness rule) before creating
   `vault/tasks/<today>-<shortid>.md` with `source: { type: gcal,
   externalId: "gcal:<eventId>", url: <htmlLink> }` and a populated
   `relatedMeeting` block (`eventId`, `title`, `start`, `reminderFired:
   false`).

## Completeness rule (do not skip)

Every task file this skill creates must have every required frontmatter
field genuinely filled in — `id`, `title`, `status`, `priority`, `created`,
`tags`, `source`, `history`. None of these may be a guessed placeholder:

- `title` — describe the actual action, not just the meeting name (e.g.
  "Prep budget numbers for Legal Sync", not "Legal Sync").
- `priority` — derive from how close the event is and how concrete the ask
  is; default to `medium` only when there's genuinely no stronger signal.
- `due` — set to the event's start time (or earlier, if prep clearly needs
  lead time) since the action is bounded by the meeting.
- `tags` — derive from attendees/event title/recurring series name.
- body — state the specific prep/follow-up required and quote the calendar
  description text that implied it, so the user can verify the inference.
- **Quote every ISO timestamp** (`created`, `due`, `completedAt`, every
  `history[].at`, and `relatedMeeting.start`) in single quotes, e.g.
  `created: '2026-08-01T09:08:35+08:00'`. An unquoted timestamp gets parsed
  as a YAML native Date instead of a string, and the server's task list
  crashes on `.localeCompare` when it hits one.

If the action implied by an event is too vague to state concretely in
`title`, don't create a task for it — log it in the summary as "possible
follow-up, too vague to act on" instead of writing an incomplete task.

## Notes

- Read-only against the live Calendar API and the 24h reminder cache —
  never write to Calendar, never touch `.credentials/google.json`.
- Never delete a meeting or task file, even if the calendar event is later
  cancelled — flag cancelled events in the summary instead.
- Report a short summary: events cached, tasks created/linked/updated, and
  any events with an implied-but-too-vague follow-up.
