---
name: sync-gmail
description: Pull starred/important Gmail threads into vault/tasks/, using this session's existing Gmail MCP connection. Auto-creates tasks for confident matches, auto-skips known noise, and queues genuinely ambiguous threads for the user to confirm. Use when the user runs /sync-gmail or asks to refresh their tasks from email.
---

# sync-gmail

Populates `vault/tasks/` from Gmail using MCP tools that are already
connected in this Claude session — no OAuth setup, no API tokens, nothing
to configure. Read `../../CLAUDE.md` first for the task file schema and the
dedup rule before writing anything. This skill only ever touches
`vault/tasks/` (and its own `vault/tasks/_inbox/` review queue) — it never
writes to `vault/notes/` or `vault/meetings/` (see `enrich-vault`) and never
handles calendar invites (see `sync-calendar` — this skill skips those
entirely, even if starred/important).

Every matched thread falls into exactly one of three buckets: **skip**
(known noise, no task, not queued), **create** (confident enough to become
a task outright), or **queue** (genuinely ambiguous — hold for the user to
decide). Never silently guess between skip and create for something
ambiguous — queue it instead.

## Step 0 — resolve the existing review queue first

Before searching Gmail, check for unresolved files in `vault/tasks/_inbox/`
named `gmail-review-*.md` (format described in Step 4). For each file:

- For every line checked `[x]`, create the full task now (apply the
  Completeness rule below using the thread details recorded in that line),
  then remove the line from the file.
- Leave every unchecked `[ ]` line in place — the user hasn't decided yet.
- If the file ends up with no lines left, delete it.

Report how many were promoted from the queue before moving on to Step 1.

## Step 1 — load existing tasks

List `vault/tasks/*.md` and read each file's frontmatter to build a set of
known `source.externalId` values (`thread:<threadId>`). Check every thread
found below against this set — if a task already exists for a thread, skip
creating a new file; only touch it if something meaningfully changed (new
reply), appending a `history` entry rather than recreating the file.

## Step 2 — search Gmail

If a Gmail MCP tool isn't already loaded, use ToolSearch (e.g.
`search_threads` / `get_thread` / `get_message`). Search for starred or
important threads (`is:starred OR is:important`) from the last ~14 days
unless the user gives a different range.

## Step 3 — categorize every new thread

**Skip outright** (no task, no queue entry, not mentioned individually in
the summary beyond a count) when the thread is:

- A calendar invite/update/RSVP — subject starts with `Invitation:`,
  `Updated invitation:`, `Accepted:`, `Declined:`, or `Cancelled:`, or
  sender is a calendar-notification address. Owned by `sync-calendar`.
- A GitHub bot notification (`sender: notifications@github.com`) whose
  content is purely terminal state with nothing asked of the user — "Closed
  #NNN", "Merged #NNN into main", CI pass/fail pings with no requested
  action. If a GitHub notification asks for review, requests changes, or
  @-mentions the user with a question, that's **create**, not skip.
- An automated account/security email with no task-worthy content — password
  reset links, email verification codes, "your session expired" style
  notices.
- A pure company-wide FYI announcement with no personal action implied
  (e.g. a benefits/wellness announcement blasted to a distribution list),
  *unless* it has a deadline or requires the user to do something
  (register, respond, opt in) — those go to create/queue instead.

**Create directly** (high enough confidence to skip the queue) when:

- The thread is from `hrdepartment@qstrike.com` (or similar) about
  attendance, cutoff reports, OB-requests, late check-ins, or anything that
  affects pay or leave balance. These matter even when they look like pure
  confirmations — an approved request or a late/missing-checkout notice is
  something the user wants tracked in case hours turn out wrong later.
  Priority `high` if it flags a problem (missed checkout, late check-in,
  failed request) since those can affect salary; `medium` for a clean
  approval confirmation.
- A specific person is directly asking the user for something — access,
  a decision, a review, an answer to a question — even if terse. (e.g.
  someone asking to be granted access, or flagging gaps in a doc for
  review.)
- The user has previously told you a specific sender's messages on a topic
  are something they explicitly asked for or care about (see Step 3a).

**Queue for confirmation** (append to the review file, see Step 4)
everything else that doesn't clearly fit skip or create — most often:

- Content shared with no stated purpose in the email itself (an image, a
  doc link, "here's an example") where you can't tell from the thread alone
  whether the user wants it tracked as a task.
- FYI/status-update threads that might be worth keeping for the user's own
  record but carry no explicit ask.
- Anything you're genuinely unsure about — when in doubt, queue, don't skip
  and don't create.

### Step 3a — learned overrides

If the user has told you (in this conversation or a prior one) that mail
from a specific sender, or about a specific topic, should always be
created or always be skipped — treat that as a standing rule for future
runs, not a one-time judgment call. When you apply a learned override,
say so in the summary (e.g. "created per your standing note that anything
from Josh sharing something you asked for should become a task") so the
user can correct it if it's drifted from what they meant.

### Step 3b — staleness override (backfills / wide date ranges)

When running over a range that isn't "the last ~14 days" (a backfill,
catch-up, or explicit month/quarter), a thread that would otherwise
qualify as create/queue may already be moot by *today's* date — a
deadline that's long past with no sign it's still open, an event that
already happened, a request superseded by a later thread. Skip these
rather than creating a stale task, but call them out in the summary
separately from the normal skip categories (one line each, with why).

Do not apply this reflexively to every old thread — first check whether
it's actually resolved:

- **Rewards/recognition threads** (MVP awards, Titanium Skills, Lead of
  the Quarter, peer nominations, etc.) — never just skip-as-stale-FYI.
  Check whether any of the user's direct reports are named as a
  nominee/winner. If yes: don't create a task, but add a short
  "Recognition" note to that person's `vault/notes/<person>.md` (what
  they won, when, source) so it surfaces at EPEP review / 1:1 time. Say
  in the summary who (if anyone) was found, even if no one was.
- **Long-running/recurring threads** (the same subject re-appearing
  across many months, an ongoing negotiation or feature-requirements
  thread) — don't override-skip just because the thread *started*
  months ago. Check the date of the most recent message in the thread.
  If it's recent (within the current batch's range or later) and the
  last exchange doesn't read as resolved (no confirmation, a missed
  meeting, an unanswered question), treat it as live: pull out the
  concrete next action and create a task for it, and update the
  relevant `vault/notes/` project hub with what the thread revealed
  about the feature/negotiation. Only override-skip a long-running
  thread if its *last* message actually reads as closed.

## Step 4 — write the review queue

For every **queue** thread, append a line to
`vault/tasks/_inbox/gmail-review-<today>.md` (create the file if it doesn't
exist, with a one-line header explaining it's a pending-review list):

```
- [ ] <thread subject> — <one-line reason it's ambiguous> — thread:<id>, from:<sender>
```

Don't create a task for these now. Tell the user at the end of the run
that a review file is waiting and roughly how many items are in it —
checking boxes and re-running `/sync-gmail` promotes them (Step 0).

## Completeness rule (do not skip)

Every task file this skill creates — whether directly in Step 3 or
promoted from the queue in Step 0 — must have every required frontmatter
field genuinely filled in — `id`, `title`, `status`, `priority`, `created`,
`tags`, `source` (`type`, `externalId`, `url`), `history`. None of these may
be a guessed placeholder:

- `title` — the thread subject, verbatim or lightly cleaned up (strip
  "Re:"/"Fwd:" chains). Never leave generic.
- `priority` — infer from real signal only (see Step 3's guidance for
  HR/attendance mail). If there's no real signal, default to `medium` —
  that's a legitimate default here, not a placeholder, but don't reach for
  `high`/`urgent` without evidence.
- `due` — only set if the thread body actually states or clearly implies a
  date. Otherwise omit it.
- `tags` — derive from the thread content/participants. If genuinely
  nothing is inferable, use `[]`.
- **Quote every ISO timestamp** (`created`, `due`, `completedAt`, every
  `history[].at`) in single quotes, e.g. `created: '2026-08-01T09:08:35+08:00'`.
  An unquoted timestamp gets parsed as a YAML native Date instead of a
  string, and the server's task list crashes on `.localeCompare` when it
  hits one.
- body — a real summary of the thread's actual content, not a boilerplate
  sentence.

If you cannot determine `title` with confidence, don't create the file —
note it in the summary instead.

## Notes

- This skill only ever creates or updates files under `vault/tasks/` (plus
  its own `_inbox/` review files) — it never deletes tasks, even if the
  source email disappears. Leave that judgment to the user.
- If the Gmail MCP connection isn't available in the current session, say
  so plainly and stop — don't fabricate tasks.
- Report a short summary at the end: tasks promoted from the queue, tasks
  created this run, tasks updated vs. left untouched, threads skipped (by
  category, with a count — not each one individually), how many new
  items are waiting in the review queue, any staleness-override skips
  (Step 3b, one line each with why), any recognition/rewards found for a
  direct report (or none), and any long-running thread that turned out
  to still be live.
