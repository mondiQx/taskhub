---
title: task-hub architecture
---

# Architecture

## Repo layout

```
task-hub/
├── apps/
│   ├── web/      — Vue 3 + Vite SPA (frontend)
│   └── server/   — Node/TypeScript + Express backend
├── vault/        — Obsidian vault, the data store
├── .claude/
│   ├── skills/   — sync/audit/journal/etc. skill folders
│   └── commands/, settings.json
├── .credentials/ — Google OAuth token cache (gitignored)
├── .data/        — sync-state.json, morning-runs.json (gitignored bookkeeping)
├── docs/architecture.md — short pointer, defers to root CLAUDE.md
├── scripts/      — morning-run.sh + two macOS LaunchAgent plists
└── CLAUDE.md     — canonical schema/convention reference
```

No shared package between `apps/web` and `apps/server` — small bits of
logic (e.g. time-bucket rules) are intentionally hand-mirrored in both
rather than factored into a shared package, since the vault is small and a
shared-package build step wasn't worth it for a single-user tool.

## Data flow

1. **Source of truth**: markdown files under `vault/`, each with YAML
   frontmatter (`gray-matter` parses/serializes them). Tasks live in
   `vault/tasks/`, one file per task.
2. **Backend boot**: `apps/server` loads every task file into an in-memory
   `taskRepository` (an `EventEmitter`).
3. **File watching**: `chokidar` watches `vault/tasks/` for external edits
   — Raymond hand-editing in Obsidian, or a Claude skill (`sync-gmail`,
   `journal`, etc.) writing files directly while the server is running.
   Changes get reconciled back into `taskRepository`.
4. **Live sync to the frontend**: a WebSocket server at `/ws` broadcasts
   typed events (`task`, `meeting`, `morning`, `review`, ...) whenever the
   repository emits `"change"`. `apps/web`'s `taskStore.ts` holds the one
   WebSocket connection, applies a snapshot on connect, and reconnects
   automatically after a drop.
5. **Search/graph**: `GET /api/vault/search` rebuilds a MiniSearch index
   fresh on every call (the vault is small enough that this is cheap and
   avoids incremental-index bugs); `GET /api/graph` walks all vault folders
   and extracts `[[wikilink]]` targets to build Obsidian-style
   nodes/edges, including synthetic grouping nodes (Jira sub-projects,
   Kanban time buckets, recurring-meeting hubs).
6. **Ingestion**: Gmail/Jira/Calendar data never touches the backend
   directly — there's no OAuth client for any of them in `apps/server`.
   Instead, Claude skills (running with this session's already-authorized
   MCP connections) write vault files, and the file watcher picks them up.
   Calendar is the one exception with backend-side OAuth (`setup:google`),
   used for the meeting-reminder scheduler and `/api/calendar/events`.

## Why the vault is the database

Markdown + YAML frontmatter gives free backlinks/tags/full-text search in
the Obsidian app itself, and lets Raymond hand-edit a task directly without
going through the web UI. The backend's in-memory repository is a cache for
speed; the files on disk are ground truth at all times.

## Ports

- Vite dev server: `5173` (proxies `/api`, `/ws`)
- Backend in dev: `4174` (`SERVER_PORT` override, so it never collides with
  the always-on prod LaunchAgent)
- Backend in production: `4173` (also serves `apps/web/dist` as static
  files, so prod is a single process/port)

See [API reference](api-reference.md), [Frontend](frontend.md),
[Skills](skills.md) for the next level of detail.
