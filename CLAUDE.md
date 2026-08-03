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
  post-it-style capture that isn't a task.
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

## Gmail / Jira sync

Gmail and Jira tasks are **not** pulled by the Node backend — there is no
OAuth client or API token for either in this repo. Instead, use the
`sync-inbox` skill (`.claude/skills/sync-inbox/SKILL.md`), which relies on
this Claude session's already-authorized Gmail and Atlassian MCP
connections. Run it via the `/sync` command, or on a schedule.

## Do not

- Do not add a SQL/NoSQL database — the vault is the store.
- Do not build custom OAuth/API integrations for Gmail or Jira — use MCP.
- Do not introduce paid APIs (transcription services, push infrastructure,
  etc.) without asking first.
