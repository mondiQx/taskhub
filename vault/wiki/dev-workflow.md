---
title: task-hub dev workflow
---

# Dev workflow

## Local development

```sh
npm install
npm run dev
```

Root `package.json` is an npm workspace (`apps/web`, `apps/server`).
`npm run dev` runs `concurrently -n web,server "npm run dev -w apps/web"
"npm run dev -w apps/server"` with `SERVER_PORT=4174` set so the dev
backend never collides with the always-on production LaunchAgent on 4173.

- Vite dev server: `http://localhost:5173`, proxies `/api` and `/ws` to the
  backend.
- Backend dev: `tsx watch src/index.ts`, port 4174.

## Config

`.env` at repo root (loaded relative to `apps/server`'s cwd via
`apps/server/src/config.ts`). See `.env.example`:

- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` /
  `GOOGLE_OAUTH_REDIRECT_PORT` (default 8765) — Calendar OAuth, the one
  connector the backend talks to directly.
- `SLACK_BOT_TOKEN` — optional.
- `VAULT_PATH` — optional override, default `../../vault`.
- `SERVER_PORT` — default 4173.

`.credentials/` (Google OAuth token cache) and `.data/` (sync-state,
automation run history) are gitignored — not vault content, safe to delete
if either ever looks wrong; skills fall back to a full scan when missing.

One-time Google Calendar OAuth setup: `npm run setup:google -w apps/server`.

## Build

```sh
npm run build   # vue-tsc -b && vite build (web), tsc (server)
npm run start   # node dist/index.js, port 4173
```

In production the backend serves `apps/web/dist` as static files off the
same port — a single process, no separate frontend server.

## Deploying to the phone (Tailscale)

Handled by the `deploy` and `connect-phone` skills — `/deploy`,
`/connect-phone`.

One-time setup:
1. Install Tailscale on the Mac and phone.
2. Install `scripts/com.raymond.task-hub.server.plist` as a LaunchAgent
   (`~/Library/LaunchAgents/`) — runs the built server on port 4173.
3. `tailscale serve --bg --https=443 http://localhost:4173`. HTTPS is
   required — mobile `getUserMedia`/mic permission prompts (for voice
   capture) fail silently over plain `http://<mac>:4173`.

Every deploy:
1. Build from a clean `staging` branch: `npm run build` at repo root.
2. Restart: `launchctl kickstart -k gui/$(id -u)/com.raymond.task-hub.server`
3. Smoke-test: `curl` against `/` and `/api/tasks`, expect 200.
4. Merge `staging` → `main` once confirmed.

Phone reaches the app at `https://<mac-tailscale-name>.<tailnet>.ts.net/`.
Logs: `/tmp/task-hub-server.stdout.log` / `.stderr.log`.

Explicitly out of scope: no port-forwarding/ngrok/public tunnels, no
app-level auth layered on top "to make it deployable" — Tailscale device
auth is the only auth boundary, by design, since this is a single-user
tool (see `CLAUDE.md`'s "Do not" section).

## Git workflow

- Never push directly to `main` — a `PreToolUse` hook in
  `.claude/settings.json` blocks it. Work on a feature branch and open a
  PR.
- Any push (branch or main) requires explicit confirmation each time, even
  if "commit and push" was said in one breath — they're separate
  approvals.
- Run the `code-review` skill on the diff before pushing, every time —
  the push-safety hook only checks branch, not code quality.
