---
name: deploy
description: Build task-hub for production and make it reachable from Raymond's phone over Tailscale, without exposing it to the public internet. Use when the user runs /deploy, asks to "deploy", "push to staging", "make this accessible from my phone", or asks about serving the app remotely.
---

# deploy

task-hub stays a **local-only, single-user tool** per `../../CLAUDE.md` —
this skill makes it reachable from Raymond's phone via **Tailscale**
(a private mesh VPN), not by exposing it to the public internet. There is
no login/auth in the app itself, so the app must never be reachable by
anything other than Raymond's own authenticated Tailscale devices.

## Why Tailscale, not a public host

- No port-forwarding, no public DNS, no TLS cert to manage.
- Access is gated by Tailscale's own device auth (Raymond's Google/GitHub
  login enrolls a device into his private tailnet) — nobody else can ever
  reach the server, even if they know the address.
- The vault (`vault/`) stays on the Mac's real disk — no syncing task/
  meeting data to a remote host, no second copy of the source of truth.
- If Raymond later wants a public-with-login setup (Cloudflare Tunnel +
  Access) or an actual cloud VPS, that's a bigger change — flag it back to
  him rather than improvising auth into the app under this skill; ask
  first.

## One-time machine setup (only needed once, not per deploy)

1. **Install Tailscale on the Mac** (`brew install --cask tailscale`) and
   sign in — this enrolls the Mac into Raymond's tailnet and gives it a
   stable name under MagicDNS (e.g. `raymonds-mac.tailXXXX.ts.net`).
2. **Install Tailscale on the phone** (App Store) and sign in with the
   same account.
3. Confirm both devices show up in `tailscale status` and can reach each
   other — don't proceed to a deploy until this works, since everything
   below assumes the private network already exists.
4. **Install the server LaunchAgent** so it survives reboots/logouts:
   ```
   cp scripts/com.raymond.task-hub.server.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.raymond.task-hub.server.plist
   ```
   Update the two absolute paths inside the plist first if the repo has
   moved. Logs land at `/tmp/task-hub-server.stdout.log` /
   `.stderr.log` — check those first if the phone can't reach it.

Do not perform steps 1–3 yourself (they require interactive OS-level
install/login) — walk Raymond through them and confirm each one, don't
assume they're already done.

## Every deploy (after code changes)

1. **Confirm the working tree is clean and on `staging`** — deploy from
   `staging`, not directly from uncommitted `main` work. If the user asks
   to deploy from `main` instead, that's fine, but say so explicitly
   rather than silently switching branches.
2. **Build**: `npm run build` at the repo root (builds `apps/web` then
   `apps/server`). Confirm both steps succeed — a failed `vue-tsc`/`tsc`
   step must stop the deploy, not get ignored.
3. **Restart the running server** so it picks up the new build:
   ```
   launchctl kickstart -k gui/$(id -u)/com.raymond.task-hub.server
   ```
   (`kickstart -k` restarts a LaunchAgent that's already loaded; use this
   instead of unload/load unless the plist itself changed.)
4. **Smoke-test** before calling it done: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4173/` and the same against `/api/tasks` should
   both return `200`. Then check reachability from the phone's Tailscale
   IP/MagicDNS name if the user is available to confirm (`http://<mac-tailscale-name>:4173`)
   — don't just assume the phone side works from the Mac-side check alone.
5. **Report** what changed since the last deploy (a short changelog from
   `git log`), whether the build/restart/smoke-test each succeeded, and
   the URL to open on the phone.

## staging branch workflow

- `staging` exists so deploy-relevant changes (server/build/infra, not
  every small UI tweak) get committed there first, smoke-tested via this
  skill, then merged to `main` once confirmed — not the other way round.
- Never force-push `staging` or `main`. Merge `staging` → `main` with a
  normal merge commit once a deploy's been confirmed working; don't
  squash/rebase away the history of what was actually deployed.
- If `main` has moved ahead of `staging` (other work landed directly on
  `main`), merge `main` → `staging` first so `staging` never deploys
  something older than what's already on `main`.

## Do not

- Do not add authentication, user accounts, or multi-tenant scaffolding to
  the app to "make it deployable" — Tailscale's device-level access is the
  auth boundary here. Adding app-level auth is a bigger decision; ask first.
- Do not expose port 4173 (or the Vite dev port 5173) via port-forwarding,
  ngrok, or any public tunnel without the user explicitly asking for that
  specific change — that would defeat the entire point of this setup.
- Do not commit `.env`, `.credentials/`, or `.data/` — they're gitignored
  for a reason (OAuth secrets, tokens, automation history).
- Do not run the production server (`npm run start`) and the dev server
  (`npm run dev`) on the same port at the same time — dev uses 5173
  (Vite) + 4173 (API); production serves everything on 4173 alone. Check
  `lsof -i :4173` before starting either if unsure what's already running.
