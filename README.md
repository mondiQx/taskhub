# task-hub

Personal task board + knowledge base for Raymond. Single user, local-only,
runs as a pinned browser tab (and over Tailscale on the phone).

The [Obsidian vault](vault/) is the database — every task, note, meeting,
and journal entry is a markdown file with YAML frontmatter. There is no
SQL/NoSQL store. See [`CLAUDE.md`](CLAUDE.md) for the full task schema,
folder conventions, and dedup rules — it's the canonical reference and is
kept up to date deliberately.

## What this is

A faster alternative to spawning an investigator/explore agent every time
a feature request or bug comes in against this repo. The app itself is a
kanban/list/post-it task board; this README plus the wiki at
[`vault/wiki/`](vault/wiki/README.md) document how it's built so triage can
start from docs instead of re-exploring the codebase each time.

## Pieces

- **`vault/`** — Obsidian vault. `tasks/` is the only folder the board
  reads from; `notes/`, `meetings/`, `journal/`, `reports/` are knowledge
  base content; `raw/` is a drop zone for source material.
- **`apps/server`** — Node/TypeScript + Express backend. Reads/writes
  `vault/tasks/` via `gray-matter`, watches the vault with `chokidar` for
  external edits (Obsidian, or a Claude skill writing files directly),
  exposes a REST API plus a WebSocket (`/ws`) that pushes live updates to
  the frontend.
- **`apps/web`** — Vue 3 + Vite SPA, Pinia for state. Kanban / post-it /
  graph / meetings / journal / history views over the same task set, voice
  capture via the Web Speech API, browser notifications for meeting
  reminders.
- **`.claude/skills/`** — Gmail/Jira/Calendar sync, daily briefing,
  draft-followups, journal capture, vault auditing/enrichment, and more.
  These are how tasks/meetings get into the vault in the first place; see
  [`vault/wiki/skills.md`](vault/wiki/skills.md) for the full list.

## Running it locally

```sh
npm install
npm run dev
```

This runs the Vite dev server (`http://localhost:5173`) and the backend
(port 4174 in dev) together via `concurrently`. Vite proxies `/api` and
`/ws` to the backend.

Copy `.env.example` to `.env` for Google Calendar OAuth config
(`GOOGLE_OAUTH_CLIENT_ID`/`SECRET`, `GOOGLE_OAUTH_REDIRECT_PORT`) and
optional `SLACK_BOT_TOKEN` / `VAULT_PATH` overrides. Gmail, Jira, and
Calendar *sync* itself goes through this session's Claude MCP connections,
not through backend OAuth — see `CLAUDE.md`.

```sh
npm run build   # vue-tsc -b && vite build, both workspaces
npm run start   # runs the built server on port 4173
```

## Documentation map

- [`CLAUDE.md`](CLAUDE.md) — task schema, folder conventions, dedup rule,
  git workflow. The single source of truth for how the vault is structured.
- [`docs/architecture.md`](docs/architecture.md) — one-paragraph pointer to
  `CLAUDE.md` plus a one-line-per-piece summary.
- [`vault/wiki/`](vault/wiki/README.md) — deeper internal docs (API
  reference, frontend structure, skills catalog, dev/deploy workflow).
  Deliberately kept out of the Obsidian graph (not cross-linked with
  `vault/notes/`/`vault/tasks/`) — it documents the *tool*, not Raymond's
  work, so it shouldn't show up as a node next to people/projects/meetings.

## Deploying / phone access

`/deploy` and `/connect-phone` (Claude skills) build the app and expose it
over Tailscale at `https://<mac>.<tailnet>.ts.net/`, restarted via a
LaunchAgent (`com.raymond.task-hub.server.plist`) on port 4173. No public
internet exposure — Tailscale device auth is the only auth boundary, by
design (single-user tool). See
[`vault/wiki/dev-workflow.md`](vault/wiki/dev-workflow.md) for details.
