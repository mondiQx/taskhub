# Architecture

See root [`CLAUDE.md`](../CLAUDE.md) for the vault schema and dedup rule —
that file is the canonical reference and is kept up to date deliberately so
any Claude Code session opened in this repo can act correctly on the vault.

## Pieces

- `vault/` — Obsidian vault, the single source of truth for tasks, notes,
  journal entries, and report material. No separate database.
- `apps/server` — local Node/TypeScript service. Reads/writes `vault/tasks/`,
  watches it for external edits (Obsidian, or Claude's sync skill), exposes
  a REST + WebSocket API, runs the Calendar and Slack connectors, and runs
  the meeting-reminder scheduler.
- `apps/web` — Vue 3 + Vite SPA. Pinned as a Chrome tab. Kanban / list /
  post-it views over the same task set, voice capture via the Web Speech
  API, browser notifications for meeting reminders.
- `.claude/skills/sync-gmail`, `sync-jira`, `sync-calendar` — pull Gmail,
  Jira, and Calendar data into `vault/tasks/`/`vault/meetings/` using this
  session's existing MCP connections. Run individually via `/sync-gmail`,
  `/sync-jira`, `/sync-calendar`, or together via `/morning`. Deliberately
  have no OAuth client or API token of their own.

## Why the vault is the database

Obsidian markdown + YAML frontmatter gives free backlinks/tags/full-text
search in the Obsidian app itself, and lets Raymond hand-edit a task
directly without going through the web UI. The backend keeps an in-memory
index for speed but treats the files on disk as ground truth at all times.
