---
name: enrich-vault
description: Pull real meeting content from Fireflies/Gemini notetaker emails in Gmail (and attendee/recurrence data from Google Calendar) to write linked notes into vault/notes/ and vault/meetings/, so Obsidian's graph view has something to show. Use when the user runs /enrich or asks to enrich, densify, or fill out the vault/knowledge base.
---

# enrich-vault

Populates `vault/notes/` and `vault/meetings/` with real, cross-linked
content — distinct from `sync-inbox`, which only ever touches
`vault/tasks/`. The point isn't task tracking, it's giving Obsidian's graph
view real nodes and edges: hub notes per project/recurring meeting series,
linked via `[[wikilinks]]` to individual meeting write-ups and to relevant
task files. Read `../../../CLAUDE.md` first for folder conventions.

Quality over volume: a small set of well-linked, substantive notes beats a
pile of near-duplicate stubs. Recurring meetings (daily standups, weekly
syncs) should be sampled, not captured instance-by-instance.

## Data sources

1. **Gmail (MCP)** — real meeting content lives in two email patterns:
   - Fireflies: subject `Your meeting recap - <title>`, sender
     `fred@fireflies.ai`. Ignore Fireflies promo/reminder emails (`Meeting
     Prep:`, `wasn't admitted`, `Share the meeting highlights!`, etc.) —
     those carry no real content.
   - Gemini notetaker: subject `Notes: "<title>" <date>`, sender
     `gemini-notes@google.com`.
   - Also watch for one-off manually-written recap emails from humans
     (not a notetaker bot) — e.g. someone emailing "Notes from X meeting"
     to a team thread. Treat those as meeting notes too.
   - Use `search_threads` with queries like `from:fred@fireflies.ai
     after:2026/01/01` / `from:gemini-notes@google.com after:2026/01/01`,
     paginate with `pageToken`, then `get_thread` (FULL_CONTENT) for the
     ones worth writing up.

2. **Google Calendar (already-authorized OAuth client, not MCP)** — the
   server has its own Calendar API integration
   (`apps/server/src/auth/oauth-google.ts` +
   `apps/server/src/connectors/calendar.ts`), set up via Google Cloud
   Console credentials in `.env` (`GOOGLE_OAUTH_CLIENT_ID` /
   `GOOGLE_OAUTH_CLIENT_SECRET`) and a one-time consent flow (`npm run
   setup:google -w apps/server`) that stored a refresh token in
   `.credentials/google.json`. That connector normally only polls a
   rolling 24h window for meeting reminders — for historical
   cross-referencing, use the separate script instead:

   ```
   npm run calendar:range -w apps/server -- --from 2026-01-01 --to 2026-08-01 [--q "search text"]
   ```

   This prints matching events as JSON (title, start/end, attendee emails,
   description, htmlLink, recurringEventId) without touching the live
   reminder cache or the vault. Use it to fill in attendee lists and
   confirm recurrence for the meeting series you found in Gmail — match by
   title and approximate date/time. If `.credentials/google.json` doesn't
   exist yet, say so plainly and proceed without calendar data rather than
   blocking.

## Steps

1. **Survey what already exists.** List `vault/notes/*.md` and
   `vault/meetings/*.md`. Read each meeting file's frontmatter for a
   `title`/`date` (or check the filename `YYYY-MM-DD-<slug>.md`) so you
   don't recreate a meeting you've already written up. This is the dedup
   rule for this skill — same spirit as `sync-inbox`'s
   `source.externalId` check, just keyed on title+date instead.

   **Enrich, don't skip, a `sync-calendar`-created file.** `sync-calendar`
   caches every calendar event into `vault/meetings/` too, but its body is
   just the raw calendar description (often empty, or just a Zoom link) —
   check for `source: gcal` in the frontmatter with no existing
   `notetakerSource` field as the signal that a file is calendar-only. If
   you find real Fireflies/Gemini content for a meeting that already has
   one of these thin files (match on title + date/recurringEventId, not
   just exact filename), **update that same file in place**: keep its
   existing frontmatter (`eventId`, `recurringEventId`, `hub`,
   `source: gcal`, `url`, any `## Participants`/`## Related` links already
   added), replace the body with the real write-up, and add
   `notetakerSource: fireflies|gemini` to the frontmatter so future runs
   know it's already been enriched. Never create a second file for a
   meeting that already has a `sync-calendar` cache file — same dedup key
   (title + date), just a richer body.

2. **Search Gmail** per the patterns above, back to whatever date range
   the user asks for (default: since the start of the current year if
   unspecified). Group results by meeting series (same recurring title) vs
   one-off meetings.

3. **Sample recurring series.** For each recurring series, fetch full
   content for a handful of representative instances (recent ones plus the
   earliest, or any instance whose content looks materially different from
   the others) — not every occurrence. For one-off meetings, fetch every
   one; they're low volume and each is distinct.

4. **Cross-reference Calendar** for the specific meetings/series you're
   writing up (`npm run calendar:range`) to pull attendee emails and
   confirm/annotate recurrence — merge that into the meeting note rather
   than leaving attendees as "unknown".

5. **Write meeting files.** If a matching `sync-calendar` cache file
   already exists (per Step 1's enrich-don't-skip rule), update it in
   place. Otherwise create a new one under
   `vault/meetings/YYYY-MM-DD-<slug>.md` with minimal frontmatter (title,
   date, `notetakerSource: fireflies|gemini|manual`, attendees if known,
   tags) plus a body in your own words (key takeaways, decisions, action
   items) — don't dump raw HTML.

   **Recurring series need a `recurs` field** (see `sync-calendar`'s
   SKILL.md for the full rationale) — a plain-English cadence string like
   `recurs: "Every Monday, 1:30–2:15 PM PHT"`, derived by comparing this
   occurrence's weekday/time against other cached occurrences of the same
   series or the hub note's `## Occurrences` list. Add it whenever you can
   confirm the pattern from two or more occurrences; a series's cache file
   filename freezes at first creation while its `date` gets overwritten to
   the latest occurrence on each sync, so without `recurs` the two can
   drift apart and look like separate meetings.

6. **Write hub notes** — one per project/recurring series under
   `vault/notes/<slug>.md`, linking out to every meeting file you wrote for
   it via `[[wikilink]]`, cross-linking to sibling hub notes where topics
   overlap, and linking to relevant existing `vault/tasks/*.md` files
   (grep vault/tasks for matching ticket IDs/keywords first — task
   wikilinks should point at the task's filename, e.g.
   `[[2026-08-01-07wj2o|[CORE-2910] DEV: Cancel Order]]`, since Obsidian
   wikilinks resolve by filename, not by the task's internal frontmatter
   `id`). Note explicitly which instances of a recurring series were
   skipped and why.

7. **Never touch `vault/tasks/*.md`** — this skill only writes to
   `vault/notes/` and `vault/meetings/`. Never write to the live calendar
   or Gmail (read-only in both directions).

8. **Report a short summary**: how many meeting files were newly created
   vs. enriched in place (existing `sync-calendar` cache files given real
   content), how many hub notes were created, which series were sampled
   vs skipped, and any meetings where content wasn't available (e.g. a
   Gemini email that only linked to a Google Doc with no inline text — say
   so rather than fabricating content).
