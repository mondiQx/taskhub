---
title: task-hub Claude skills
---

# Claude skills (`.claude/skills/`)

How tasks/meetings/notes get into the vault, and how the vault gets kept
tidy. Each folder has its own `SKILL.md`; this is a one-line-per-skill
index. `/morning` and `/briefing`/`/enrich` are slash-command aliases that
compose these, not skill folders of their own.

| Skill | Purpose |
|---|---|
| **sync-gmail** | Pulls starred/important Gmail threads into `vault/tasks/` via MCP. Auto-creates confident matches, auto-skips known noise, queues ambiguous threads for confirmation. |
| **sync-jira** | Pulls Jira issues assigned to the user into `vault/tasks/` via MCP. One-way — never writes back to Jira. |
| **sync-calendar** | Pulls upcoming Google Calendar events into `vault/meetings/`, creates/links tasks for events needing prep/follow-up, checks recurring-meeting changes, scans Gmail for HR holiday announcements. |
| **journal** | Captures a raw, mixed-topic brain dump (typed or dictated) — writes it verbatim to `vault/journal/<today>.md` first, then proposes (never silently applies) extracted task/meeting updates via a review-queue file. |
| **daily-briefing** | Read-only summary of overdue/due-soon tasks, today's meetings, and pending review-queue items. |
| **draft-followups** | Prepares Gmail drafts and Jira comment text for stalled tasks. Never sends/posts automatically — a deliberate safety boundary. |
| **record-task** | Turns freeform typed or dictated input into a single, fully-populated task file (`source.type: manual` or `voice`). |
| **audit-vault** | Finds thin/stub files across tasks/notes/meetings and enriches them in confirmed batches using Gmail/Jira/Calendar + `vault/raw/` material. |
| **enrich-vault** | Pulls real meeting content from Fireflies/Gemini notetaker emails + Calendar attendee/recurrence data to write linked notes into `vault/notes/`/`vault/meetings/`, so the graph view has something to show. |
| **close-task-notes** | When a task is marked done, proposes routing worthwhile content from it into `vault/notes/` rather than letting it rot in a closed task. |
| **code-review** | Reviews a working diff against this repo's own conventions/CLAUDE.md rules before a push. |
| **deploy** | Builds task-hub for production and exposes it over Tailscale (never the public internet). |
| **connect-phone** | Starts/stops/checks the LaunchAgent that runs the production server on port 4173 for phone access. |

## Composite slash commands

- **`/morning`** — runs `sync-gmail` → `sync-jira` → `sync-calendar` →
  `daily-briefing` → `draft-followups` in sequence, so later steps see the
  freshly-synced vault. Backed by `scripts/morning-run.sh` +
  `com.raymond.task-hub.morning.plist` (LaunchAgent, fires headlessly at
  07:45 local time when the laptop is on and logged in — not installed by
  default).
- **`/briefing`** — alias for `daily-briefing`.
- **`/enrich`** — alias for `enrich-vault`.

## Design principles worth remembering when adding a skill

- **No auto-send/auto-post.** `draft-followups` prepares content; it never
  sends Gmail or posts Jira comments on its own. Don't add that path
  without the user explicitly asking for it in writing.
- **Confirm before applying fuzzy matches.** `journal` and `audit-vault`
  both propose changes via a review-queue file rather than writing
  directly, mirroring `sync-gmail`'s pattern — genuinely unambiguous
  references are the only exception.
- **Dedup on `source.externalId`.** Any skill ingesting from an external
  source must search existing `vault/tasks/` files for a matching
  `source.externalId` before creating a new task file.
