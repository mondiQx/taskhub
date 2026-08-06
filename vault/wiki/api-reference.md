---
title: task-hub API reference
---

# API reference

All routes are mounted under `/api` in `apps/server/src/index.ts`, defined
in `apps/server/src/api/router.ts`. In production the same Express app also
serves `apps/web/dist` as static files.

## Tasks

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tasks` | list all tasks (in-memory repository) |
| POST | `/api/tasks` | create a task (`title` required) |
| PATCH | `/api/tasks/:id` | update fields, records an `"updated"` history event |
| POST | `/api/tasks/:id/seen` | clears `seenAt` / the "New" badge |
| DELETE | `/api/tasks/:id` | delete |
| POST | `/api/tasks/:id/complete` | mark done |
| POST | `/api/tasks/:id/reopen` | reopen, optional `note` in body |
| POST | `/api/ingest` | connector ingestion (calendar/Slack); dedups on `source.type` + `source.externalId` |
| POST | `/api/voice-note` | creates a task from a raw voice transcript (`source.type: "voice"`) |

## Vault-wide

| Method | Path | Notes |
|---|---|---|
| GET | `/api/vault/search?q=` | MiniSearch fuzzy/prefix search over title+tags+body across tasks/notes/meetings/journal/reports |
| GET | `/api/vault/resolve/:id` | resolves a wikilink-style id to its folder (+ `taskId` if it's a task) |
| GET | `/api/vault/:folder/:id` | reads one vault file's rendered content, for the NoteModal |
| GET | `/api/graph` | full backlink graph across all folders, incl. synthetic grouping nodes |

## Meetings

| Method | Path | Notes |
|---|---|---|
| GET | `/api/meetings` | cached meeting list |
| GET | `/api/meetings/full` | fuller meeting payload |
| GET | `/api/calendar/events` | cached calendar events |

## Review queues

| Method | Path | Notes |
|---|---|---|
| GET | `/api/review-queue` | Gmail review-queue items from `vault/tasks/_inbox/` |
| POST | `/api/review-queue/:id/promote` | |
| POST | `/api/review-queue/:id/dismiss` | |
| GET | `/api/journal-review` | `/journal` skill's proposed extractions |
| POST | `/api/journal-review/:id/confirm` | |
| POST | `/api/journal-review/:id/reject` | |

## Journal

| Method | Path | Notes |
|---|---|---|
| GET | `/api/journal` | list journal entries |
| POST | `/api/journal` | append text to today's journal (`section: "Journal" \| "Personal notes"`) |
| PATCH | `/api/journal/:date` | replace a specific day's body (`date` must be `YYYY-MM-DD`) |

## Automation runs

| Method | Path | Notes |
|---|---|---|
| GET | `/api/morning/history` | |
| POST | `/api/morning/run` | runs `/morning`'s composite sequence |
| POST | `/api/morning/stop` | |
| GET | `/api/journal/analyze/history` | |
| POST | `/api/journal/analyze/run` | body: `{date}` |
| POST | `/api/journal/analyze/stop` | |

## WebSocket (`/ws`)

Attached to the same `http.Server` as Express. On connect it sends:

- `snapshot` — full task list
- `review-snapshot`
- `journal-review-snapshot`
- the latest `morning`/`journal-analysis` run, if any

Then broadcasts typed `ServerEvent`s to all connected clients whenever the
underlying repository/event-emitter fires `"change"`:

- `task` (added/updated/removed)
- `meeting`
- `morning`
- `journal-analysis`
- `review`
- `journal-review`

`apps/web/src/stores/taskStore.ts` owns the one client-side connection:
`init()` does `GET /api/tasks` then opens the socket, auto-reconnects after
2s on close, and applies incoming messages into Pinia state.
