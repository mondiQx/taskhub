---
name: sync-calendar
description: Pull upcoming Google Calendar events into vault/meetings/ and create/link vault/tasks/ for events that need prep or follow-up, using the server's existing Google Calendar OAuth connector. Also checks whether cached recurring meetings have changed and scans Gmail for HR holiday announcements. Use when the user runs /sync-calendar, asks to refresh tasks or meetings from their calendar, asks whether a recurring meeting has updates, or asks about upcoming holidays.
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
description, htmlLink, hangoutLink, recurringEventId, eventId) without
touching the live reminder cache. Default window if the user doesn't specify
one: today through 14 days out. If `.credentials/google.json` doesn't exist,
say so plainly and stop — don't fabricate calendar data.

## Steps

1. **Load existing state.** List `vault/meetings/*.md` (dedup key: event
   title + start time, or filename `YYYY-MM-DD-<slug>.md`) and
   `vault/tasks/*.md`, reading frontmatter for existing `relatedMeeting.eventId`
   values and `source.externalId` values of the form `gcal:<eventId>`. Also
   check `vault/notes/` for existing `type: meeting-hub` notes (e.g.
   `engineering-mancom.md`, `checkpoints-dev-improvements-plan.md`,
   `epep-review.md`) — these are `enrich-vault`'s standing-roster records
   for a recurring series and should be linked from the series' cache file
   (see Step 3), not treated as a substitute for one.

2. **Fetch events** via `calendar:range` for the window.

3. **Cache each event** into `vault/meetings/YYYY-MM-DD-<slug>.md` if not
   already present: frontmatter with `title`, `date`/`start`/`end`,
   `attendees`, `eventId`, `recurringEventId` (if any), `source: gcal`,
   `url` (htmlLink), and `meetLink` (hangoutLink, only if the event has
   one — a lot of internal/no-video meetings won't). `url` points at the
   Calendar event page; `meetLink` is the actual `https://meet.google.com/xxx-xxxx-xxx`
   room the UI's "Join on Meet" button uses — don't conflate the two or
   write the Calendar link into `meetLink`. Body: the event description
   verbatim if present. Update in place (don't duplicate) if the event
   already has a cached file but details changed (time moved, attendees
   changed, hangoutLink appeared/changed).

   **"Latest occurrence" means the nearest one to today, not the
   furthest-out one in the fetched window.** The default sync window is
   14 days out, so a weekly (or daily) series can return 2-3 occurrences
   in one fetch. Overwrite `date`/`start`/`end` with whichever cached-or-
   fetched occurrence is closest to today (today's own occurrence if the
   series runs today) — never the last one in the returned list. Getting
   this backwards silently hides today's meeting from anything that
   filters the vault by today's date, and makes the meeting look further
   out than it really is in the Upcoming view (a real incident: three
   series — AI Consortium, AI Studio project weekly team meeting, AI
   Initiative weekly sync — all got cached with their furthest-out
   occurrence instead of the nearest, so they silently vanished from
   "coming up soon" until caught by hand).

   Do this mechanically, don't eyeball the JSON array order: for a given
   series, take every occurrence `calendar:range` returned for it, keep
   only those with `start >= now`, and pick the one with the **minimum**
   `start` — that occurrence's `id`/`start`/`end`/`attendees`/`htmlLink`/
   `hangoutLink` go into the cache file's `eventId`/`date`/`start`/`end`/
   `attendees`/`url`/`meetLink`. If you're not certain which fetched
   occurrence is nearest, sort them by `start` ascending first — never
   assume the API/tool output is already in that order.

   **Recurring events need a `recurs` field.** Because a recurring
   series's cache file gets its `date`/`start`/`end` overwritten to the
   nearest occurrence each sync (see above), the filename's date (frozen at
   first creation) and the frontmatter date will drift apart over time —
   easy to misread as two different meetings. Any file with a
   `recurringEventId` (or otherwise known to recur, even without one) must
   carry a plain-English `recurs` field describing the cadence, e.g.
   `recurs: "Every Monday, 1:30–2:15 PM PHT"` or
   `recurs: "Every 3 months, 2nd Friday, 1:30–2:30 PM PHT"` or
   `recurs: "Quarterly (~13 weeks apart), 1:30–3:00 PM PHT — day of week
   varies"`. Derive it by comparing the current occurrence's weekday/time
   against earlier cached occurrences of the same series (or the series'
   hub note's `## Occurrences` list) — don't guess without at least two
   data points; if only one occurrence exists so far, leave `recurs` off
   until a second one confirms the pattern.

   **Hub-linked series**: recurring series still get their own
   `vault/meetings/` cache file, same as any other recurring meeting — a
   `type: meeting-hub` note in `vault/notes/` (e.g. `engineering-mancom.md`,
   `checkpoints-dev-improvements-plan.md`) is a *elaboration* of the
   series (standing roster, purpose), not a replacement for its cache file.
   When a series matches an existing hub (by series name/attendee overlap,
   not just exact title — e.g. "Eng'g Dept Mancom - Management" and "Eng'g
   Dept Mancomm - with Leads" both map to `engineering-mancom.md`):
   - Set `hub: "<hub-note-id>"` in the cache file's frontmatter.
   - Name the file so its slug (date prefix stripped) equals the hub id or
     starts with `<hub-id>-` (e.g. `2026-03-30-engineering-mancom-with-leads.md`
     for the `engineering-mancom` hub) — `apps/server/src/vault/graph.ts`
     merges a meeting file into its hub node in the Graph view on exactly
     this match, but only if the hub note also links to it.
   - Add a `[[<meeting-file-id>]]` link under an "## Occurrences" heading
     in the hub note pointing at the cache file, so that graph merge
     actually fires.
   - Keep the body as the real event description (agenda text, etc.), with
     a trailing `See [[<hub-id>]] for the recurring committee and
     attendees.` line back to the hub — don't duplicate the hub's static
     roster into the cache file itself.
   Recurring series with no matching hub note get a plain cache file as
   before, no `hub` field. Either way, write one file per distinct
   `recurringEventId`/series (not one per occurrence) and update it in
   place as later occurrences come in — don't create a new file per week,
   and don't rename the file just because the underlying
   `recurringEventId` regenerates (Google Calendar occasionally re-creates
   a series with a new id; keep updating the same cache file).

4. **Link the cached file to people and projects** — don't leave it
   floating, disconnected from everything else in the graph. Add these as
   two headings appended to the body (after the description, in this
   order), each only if there's at least one real match:

   - **`## Participants`** — one `[[person-note-id]]` link per attendee who
     has an existing `type: person` note under `vault/notes/`. Match by
     email: take the local part before `@` and compare it against the
     known person notes (most person notes use a first-name or
     `f.lastname` local part — e.g. `elmer@qstrike.com` →
     `[[elmer-alvarado]]`, `c.dismaya@qstrike.com` → `[[chris-dismaya]]`).
     Build this mapping from what's actually in `vault/notes/` at run
     time (list `type: person` notes, don't hardcode a fixed roster) —
     new people get notes over time. Skip attendees with no matching
     note (generic team aliases, external addresses, people who don't
     have a note yet) rather than guessing or creating one.
   - **`## Related`** — one `[[hub-note-id]]` link per project/team hub
     note under `vault/notes/` (`type: hub`) that the meeting's title or
     description is clearly about (e.g. "Core Customizer - Daily Stand Up
     Meeting" → `[[core-customizer]]`, an analytics-roadmap/alignment
     meeting → `[[data-analytics-team]]`). Only link when the topic match
     is genuinely clear from the title/description — don't force a link
     onto a personal 1:1, admin/equipment errand, or other one-off with no
     natural project home; leaving `## Related` off entirely is correct
     for those.

   For a hub-linked recurring series (previous bullet), the hub link is
   already the `hub:` frontmatter field + the "See [[hub-id]]..." line —
   don't also add a redundant `## Related` section pointing at the same
   hub.

5. **Decide which events need a task.** Not every calendar event warrants
   one — most are just informational. Create or update a task only when
   there's a real, identifiable action:
   - The event description or title explicitly asks for prep ("bring X",
     "review Y before this", "come prepared with...").
   - It's a recurring 1:1/sync where the user is clearly expected to have
     an update ready, and there's evidence of that in the description.
   - The user has an existing open task whose `relatedMeeting.eventId`
     should now point at this event (link, don't duplicate).
   Do not create a task just because a meeting exists on the calendar.

6. **For events that need a task**, gather everything needed for a
   **complete** task (see Completeness rule) before creating
   `vault/tasks/<today>-<shortid>.md` with `source: { type: gcal,
   externalId: "gcal:<eventId>", url: <htmlLink> }` and a populated
   `relatedMeeting` block (`eventId`, `title`, `start`, `reminderFired:
   false`).

   **Duplicate-in-spirit check**: before creating, check whether an
   existing task already covers the same underlying commitment (a
   recurring meeting's standing prep/reminder task, etc.) — update/link
   that one instead of creating a second task for the same recurring
   series.

## Step 3a — staleness override (backfills / wide date ranges)

When running over a range that isn't "today through 14 days out" (a
backfill, catch-up, or explicit month/quarter), an event that would
otherwise imply a create/update may already be moot by *today's* date —
the meeting already happened and nothing came of it, a recurring series
was superseded or cancelled, a follow-up was clearly handled elsewhere.
Skip creating a task for these, but call them out in the summary
separately from the normal skip categories (one line each, with why).

Don't apply this reflexively to every past event — check the actual
current state (did the meeting happen, is there evidence of a follow-up
already done, is the recurring series still on the calendar) before
deciding something's stale.

## Step 3b — direct-report calendar signal (Raymond's calendar only)

This skill only ever reads Raymond's own calendar — never pull a direct
report's calendar directly. Signal about Joseph Cruz, Adonis Suico, Chris
Dismaya, or Reggienel Patawaran comes only from events on *Raymond's*
calendar that they're also on (declines, no-shows, recurring 1:1s, etc.).

Never create a `vault/tasks/` entry from this signal — it's their work,
not Raymond's. Instead, when genuinely worth flagging, add a short note
to that person's `vault/notes/<person>.md` (what was observed, when,
source event). Worth flagging includes both hard and softer patterns:

- A direct report repeatedly declining or no-showing a recurring meeting
  they own or are expected at.
- A scheduling conflict between something on Raymond's calendar and
  something involving that report that Raymond cares about.
- Softer patterns: a report's attendance/availability looking unusually
  sparse or overloaded across a stretch, odd clustering of meetings, or
  other calendar shape worth mentioning at a 1:1 — even without a single
  clear-cut incident.

Say in the summary who (if anyone) triggered a note, even if no one did.
Calibrate conservatively at first — this is a newer, softer bar than the
Jira recognition signal, so when unsure, mention it as a lower-confidence
observation rather than staying silent.

## Step 3c — recurring-meeting roundup (live snapshot, not backfill)

Maintain **one task per direct report** rounding up recurring meetings
with Raymond that they're currently missing/declining, or standing
meetings that still need prep — mirroring the sync-jira active-ticket
roundup shape. This is a **live current-state snapshot** evaluated at
sync time, not something to rebuild per historical month during a
backfill.

- Dedup on `source.externalId: "calendar-roundup:<person-slug>"` — update
  the same file in place each run (replace the meeting list and `title`,
  append a `history` entry) rather than creating a new file every sync.
- `title` format: `Check on <FirstName>'s recurring meetings: <meeting>,
  <meeting>, ...`
- Body: one bullet per meeting — series name, pattern observed (e.g.
  "declined last 3 occurrences", "no-show twice this month"), last
  occurrence date.
- If a person has no qualifying pattern, don't create or keep a task for
  them (delete the file if one exists from a prior run and is now empty).
- This roundup never touches `vault/notes/` — Step 3b is the only
  direct-report thing that writes there.

## Step 3d — recurring-series freshness check (on request)

When the user asks whether a recurring meeting "has updates" or "changed"
(rather than a plain sync), don't just trust the cache file — check the
live calendar for that series:

1. Identify the series from its cache file's title and, if present,
   `recurringEventId` (base id before the `_R...` suffix — Google
   regenerates that suffix when a series is edited, so match on the base
   id and/or the normalized title, same as `recurringSeries` grouping in
   `apps/web/src/views/MeetingsView.vue`).
2. Run `calendar:range` with `--q "<series title>"` over a window from
   the cache file's current `date` up through today (plus a couple weeks
   out, to catch a rescheduled next occurrence). Compare each returned
   occurrence against what's cached: attendee list, start/end time,
   description text, and whether a newer occurrence exists at all.
3. If something changed, update the cache file in place (per Step 3) and
   say specifically what changed (e.g. "attendee list grew: +2 people",
   "time moved from 1:30pm to 2:00pm", "no changes — still weekly
   Mondays 1:30–2:15pm").
4. If the series no longer appears in the live calendar at all going
   forward, say so explicitly rather than leaving `recurs` silently wrong
   — a discontinued series with a stale `recurs` field would otherwise
   keep projecting phantom "upcoming" occurrences (see
   `apps/web/src/views/MeetingsView.vue`'s `projectNextOccurrence`).

This is a targeted, on-request check — not part of the default sync
flow, since re-verifying every recurring series on every run would be
wasteful. Run it for one named series, or for all cached recurring
series if the user asks generally ("check if any recurring meetings
changed").

## Step 3e — holiday awareness

HR (`hrdepartment@qstrike.com`) sends a monthly "Holiday Announcement"
email (subject often just "Holiday Announcement" or "`<Month>` Holiday")
to `qstrikeemployee@qstrike.com`, roughly a month ahead of the month it
covers, listing that month's regular/special-non-working holidays with
specific dates. When the user asks about upcoming holidays, or as part
of a periodic check:

1. Search Gmail: `from:hrdepartment@qstrike.com Holiday
   after:<a date a bit before the window you care about>`. Read the
   full body (`get_thread`) — the holiday dates and names are in the
   message text, not just the snippet.
2. For each holiday date that's still upcoming, cache it into
   `vault/meetings/YYYY-MM-DD-<slug>.md` with minimal frontmatter:
   `title` (e.g. "Holiday: Independence Day"), `date` (the holiday
   date, no `start`/`end` — it's all-day), `source: gmail`, `url` (the
   announcement's Gmail link if available). No `attendees`/`eventId` —
   these aren't calendar events. This lets them surface in the
   Meetings view's Upcoming/History columns like any other cached
   entry, without needing UI changes.
3. Dedup by date + holiday name (same spirit as the meeting dedup key)
   — don't recreate a file for a holiday that's already cached.
4. If no announcement exists yet for the window the user's asking
   about (HR hasn't sent it yet — they run about a month ahead), say so
   plainly rather than guessing at dates from general knowledge of
   Philippine holidays. Note when the next announcement would plausibly
   arrive based on the observed monthly cadence, and suggest checking
   back then.

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
- Report a short summary: events cached, tasks created/linked/updated, any
  events with an implied-but-too-vague follow-up, any staleness-override
  skips (Step 3a, one line each with why), any direct-report signal found
  or roundup task updated (Step 3b/3c), or none, and roughly how many
  cached files got `## Participants`/`## Related` links (Step 4) vs. were
  left unlinked because no real match existed. If a freshness check
  (Step 3d) or holiday scan (Step 3e) ran, report their findings too —
  what changed (or didn't), and which holidays got cached (or that none
  were available yet).
