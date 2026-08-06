---
name: connect-phone
description: Start, stop, or check the LaunchAgent that runs task-hub's production server on port 4173 for phone access over Tailscale. Use when the user runs /connect-phone, asks to bring the phone/Tailscale server up or down, or asks whether the phone can currently reach task-hub.
---

# connect-phone

Controls `com.raymond.task-hub.server` — the LaunchAgent that runs the
**built** server (`apps/server/dist/index.js`) on port 4173, which is what
Raymond's phone reaches over Tailscale (see the `deploy` skill for the
full setup rationale). This is separate from `npm run dev`, which now runs
on port 4174 specifically so it never conflicts with this LaunchAgent —
both can run at the same time.

Plist location: `~/Library/LaunchAgents/com.raymond.task-hub.server.plist`
Logs: `/tmp/task-hub-server.stdout.log`, `/tmp/task-hub-server.stderr.log`

## Determine intent

Read the user's request and pick one of the actions below. Default to
**status** if it's ambiguous.

### Status (default)

```
launchctl list | grep task-hub
lsof -nP -iTCP:4173 -sTCP:LISTEN
```

Report whether it's loaded and listening. If loaded but not listening,
check the stderr log for a crash.

### Start / connect

```
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.raymond.task-hub.server.plist
```

If it's already loaded, `bootstrap` will error — that's fine, just report
it's already running (confirm with the status check above). If it's loaded
but the process died, use `launchctl kickstart -k gui/$(id -u)/com.raymond.task-hub.server`
instead to restart it without reload.

After starting, confirm with:
```
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4173/
```
Expect `200`. Then tell the user the phone can reach it at
`https://<mac-tailscale-name>.<tailnet>.ts.net/` (get the exact hostname
via `tailscale status`) — this is the HTTPS Tailscale Serve endpoint
(`tailscale serve --bg --https=443 http://localhost:4173`, see the
`deploy` skill's one-time setup), which is required for mic/getUserMedia
permission prompts to work on mobile browsers. Plain `http://<mac-name>:4173`
still works for non-mic use but silently fails the mic permission prompt.

### Stop / disconnect

```
launchctl bootout gui/$(id -u)/com.raymond.task-hub.server
```

This stops the process and unloads the agent (won't auto-restart on
reboot until reloaded). Confirm port 4173 is free afterward:
```
lsof -nP -iTCP:4173 -sTCP:LISTEN
```
Note this also takes down phone access until it's started again.

## Do not

- Do not touch port 4174 or the dev server (`npm run dev`) — this skill
  only manages the production LaunchAgent on 4173.
- Do not edit the plist's paths/ports as a side effect of a start/stop
  request — if the plist itself needs changes, flag that back to Raymond
  rather than editing it silently.
- Do not run `npm run build` here — that's the `deploy` skill's job. This
  skill only starts/stops the already-built server.
