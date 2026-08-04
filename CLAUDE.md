# task-hub

Personal task board + knowledge base. The Obsidian vault at `vault/` is the
database — there is no separate SQL/NoSQL store. Everything that reads or
writes tasks (the Vue app, the Node backend, this repo's own Claude skills,
and Raymond hand-editing notes in the Obsidian app) must follow the schema
below so all four stay consistent.

This is a personal, single-user, local-only tool. Do not add multi-tenant,
auth-hardening, or enterprise patterns — optimize for "one person, one Mac".

## Folder conventions

- `vault/tasks/` — one markdown file per task (see schema below). This is the
  only folder the kanban/list/post-it board reads from.
- `vault/notes/` — long-lived freeform knowledge-base notes, not tasks.
- `vault/journal/` — daily notebook-journal files, `YYYY-MM-DD.md`, for quick
  post-it-style capture that isn't a task. A `## Journal` section holds raw,
  unedited brain-dump text (see the `journal` skill); a `## Personal notes`
  section holds reflective/non-actionable content (career interests,
  frustrations, morale) that doesn't belong in any task or meeting note.
- `vault/reports/` — the actual reports (docs/decks) live in Google Drive,
  not here, but this folder does hold **comprehensive synthesized
  summaries**, not just pointer stubs. Layout per report series:
  - `vault/reports/<series-name>.md` — hub note: what the report is, who
    it's for, cadence/deadline, the Drive folder link, and a list linking
    out to each period's summary note.
  - `vault/reports/<series-name>/<period>.md` — one note per period
    (month, or per-week-appended-monthly for weekly decks) with a full
    written summary of what happened, cross-linked to the people/topics/
    meetings it touches — so Obsidian's graph and backlinks work like any
    other note. For a series delivered weekly but reviewed monthly (e.g.
    the DnA weekly report), use one note per month and append new weekly
    sections as they land, rather than one file per week.
  - Do not paste the raw doc/deck text verbatim — write a synthesized
    summary in your own words, organized by the report's own sections.
- `vault/meetings/` — cached calendar events, for reference/linking from tasks.
- `vault/raw/` — drop zone for source material (screenshots, PDFs, exported
  docs, photos of whiteboards, etc.) that isn't itself vault content. The
  `audit-vault` skill reads from here to enrich thin notes/meetings/tasks,
  then the file can be deleted — nothing in the kanban/list/post-it board or
  the graph view reads this folder directly.

## Task file schema

Filename: `vault/tasks/YYYY-MM-DD-<shortid>.md` (created date + a short random
id, e.g. `2026-08-01-a1b2c3.md`). One task per file.

```yaml
---
id: a1b2c3d4
title: "Follow up with legal on MSA redlines"
status: open              # open | in-progress | done | archived
priority: high             # low | medium | high | urgent
created: 2026-07-24T09:12:00-04:00
due: 2026-08-05T17:00:00-04:00     # optional
completedAt: null
tags: [contracts, legal]
source:
  type: gmail              # gmail | jira | slack | gcal | manual | voice
  externalId: "thread:18c9f0a2b3"   # dedup key — see below
  url: "https://mail.google.com/mail/u/0/#inbox/18c9f0a2b3"
relatedMeeting:             # optional — links a task to a calendar event
  eventId: "gcal:evt_98213"
  title: "Legal Sync"
  start: 2026-08-04T14:00:00-04:00
  reminderFired: false
history:
  - at: 2026-07-24T09:12:00-04:00
    event: created
  - at: 2026-07-30T16:40:00-04:00
    event: reopened
    note: "Client pushed back again"
---

Free-text body: description, discussion points, anything else.

## History
- 2026-07-24: Created from Gmail thread.
- 2026-07-30: Reopened — client pushed back again.
```

`history` in the frontmatter is the fast, queryable copy the backend reads.
The `## History` section in the body is a human-readable mirror of the same
events, auto-appended whenever the frontmatter `history` array grows — keep
both in sync on every write.

## Dedup rule (important)

Before creating a new task file for anything ingested from an external
source (Gmail, Jira, Slack, Calendar), search existing files under
`vault/tasks/` for one whose `source.externalId` already matches. If found,
**update that file** (fields + append a `history` entry) instead of creating
a new one. Never create a second task file for the same `source.externalId`.

## Gmail / Jira / Calendar sync

Gmail, Jira, and Calendar data are **not** pulled by the Node backend —
there is no OAuth client or API token for any of them in this repo.
Instead, each source has its own skill under `.claude/skills/`
(`sync-gmail`, `sync-jira`, `sync-calendar`), relying on this Claude
session's already-authorized Gmail/Atlassian/Google Calendar MCP
connections. Run them individually via `/sync-gmail`, `/sync-jira`,
`/sync-calendar`, or all at once via `/morning` (see below).

## Automation

- `.data/sync-state.json` — bookkeeping used by `sync-gmail`/`sync-jira`/
  `sync-calendar` to avoid re-reading/re-classifying the same threads,
  issues, and calendar occurrences on every run (tracks `lastRunAt` +
  per-item decisions per source). Not vault content — gitignored, safe to
  delete if it ever looks wrong (each skill falls back to a full scan when
  it's missing).
- `vault/tasks/_inbox/gmail-decisions-log.md` — permanent, append-only
  record of every accept/reject decision made on a Gmail review-queue
  item, whether done via the web app's Review Queue view ("Create task"/
  "Dismiss" buttons) or by hand-checking/deleting a line in a
  `gmail-review-*.md` file. Unlike the queue files themselves (whose lines
  disappear once resolved), this log is never trimmed — it's how you can
  go back and see what you decided and when.
- `/briefing` (`daily-briefing` skill) — read-only summary of overdue/
  due-soon tasks, today's meetings, and pending review-queue items.
- `/draft-followups` (`draft-followups` skill) — prepares Gmail drafts and
  Jira comment text for stalled tasks. **Never sends/posts automatically**
  — this is a deliberate safety boundary, not an oversight. Don't add an
  auto-send path without the user explicitly asking for it in writing.
- `/morning` — runs sync-gmail → sync-jira → sync-calendar →
  daily-briefing → draft-followups in sequence, so later steps see the
  freshly-synced vault.
- `/journal` (`journal` skill) — for a raw, mixed-topic brain dump (typed or
  dictated). Always writes the input verbatim to `vault/journal/<today>.md`
  first, then proposes extracted task updates/new tasks/meeting recaps via
  `vault/tasks/_inbox/journal-review-<today>.md` for confirmation rather
  than applying fuzzy-matched changes silently — mirrors the `sync-gmail`
  review-queue pattern. Only unambiguous references get applied directly.
- `scripts/morning-run.sh` + `scripts/com.raymond.task-hub.morning.plist` —
  a macOS LaunchAgent that fires `/morning` headlessly at 07:45 local time
  when the laptop is on and logged in. Not installed by default; see the
  plist comments for what it does before loading it with `launchctl`.

## Do not

- Do not add a SQL/NoSQL database — the vault is the store.
- Do not build custom OAuth/API integrations for Gmail or Jira — use MCP.
- Do not introduce paid APIs (transcription services, push infrastructure,
  etc.) without asking first.
