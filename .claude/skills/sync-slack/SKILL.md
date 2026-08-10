---
name: sync-slack
description: Pull flagged/mentioned Slack messages and awaiting-reply DMs into vault/tasks/, using this session's existing Slack MCP connection. Auto-creates tasks for confident matches, auto-skips known noise, and queues genuinely ambiguous messages for the user to confirm. Use when the user runs /sync-slack or asks to refresh their tasks from Slack.
---

# sync-slack

> **Tool-name note:** the Slack MCP connector isn't authorized in this
> session yet, so the exact tool names/schemas below (`search_messages`,
> `get_thread`, `list_channels`) are best guesses based on a standard
> Slack MCP surface, not confirmed. Once the connector is authorized, use
> ToolSearch to find the real tool names and adjust this skill's Step 2
> accordingly — the categorization logic (Step 3 onward) shouldn't need to
> change, just the calls that fetch the data. **Never call a posting tool
> (`post_message`, `chat.postMessage`, etc.) from this skill** — see the
> one-way/never-send note below.

Populates `vault/tasks/` from Slack using MCP tools that are already
connected in this Claude session — no OAuth setup, no API tokens, nothing
to configure. Read `../../CLAUDE.md` first for the task file schema and the
dedup rule before writing anything. This skill only ever touches
`vault/tasks/` (and its own `vault/tasks/_inbox/` review queue) — it never
writes to `vault/notes/` or `vault/meetings/` and never posts, reacts, or
replies in Slack. Mirrors the "never auto-send" boundary `draft-followups`
establishes for Gmail/Jira — this skill only ever *reads* Slack.

Every matched message falls into exactly one of three buckets: **skip**
(known noise, no task, not queued), **create** (confident enough to become
a task outright), or **queue** (genuinely ambiguous — hold for the user to
decide). Never silently guess between skip and create for something
ambiguous — queue it instead.

## Step -1 — load sync state

Read `.data/sync-state.json` (repo root, not under `vault/` — it's
bookkeeping, not vault content; already covered by the repo's `.data/`
gitignore entry). Create it as `{}` if it doesn't exist yet. Look at the
`slack` key (treat as `{ lastRunAt: null, messages: {} }` if absent).

- **Normal run** (not an explicit backfill/wide-range request): narrow
  Step 2's search window using `lastRunAt` instead of a fixed lookback —
  round down to whole days and add a 2-day overlap buffer, e.g. if
  `lastRunAt` was 3 days ago, search the last 5 days. The buffer exists so
  a thread right at the window's edge, or one that got a fresh reply just
  after the last run, doesn't get missed.
- If `lastRunAt` is missing, unreadable, or the file is corrupt, fall back
  to a full ~14-day window, and say so plainly in the summary ("no prior
  sync state found, ran the full 14-day window") — never let a bad state
  file silently narrow the search without flagging it.
- For an explicit backfill/date-range request, ignore `lastRunAt` and use
  the requested range as today — but still update `slack.lastRunAt` and
  `slack.messages` at the end (Step 5) so the *next* normal run goes back
  to being incremental.
- `messages[<channel>:<ts>]` holds `{ decision: "skip"|"create"|"queue"|
  "declined", at: "<ISO>" }` from the last time this message/thread was
  classified. A message already recorded (any decision) that reappears
  with no newer reply than the recorded `at` doesn't need to be re-read or
  re-classified — reuse the cached decision silently.
- **A new reply always overrides the cache, regardless of prior
  decision.** Compare the thread's latest reply timestamp against the
  recorded `at` before trusting any cached entry — `skip` and `declined`
  are not permanent verdicts, they're "nothing new to decide as of last
  time." If Slack shows a reply newer than `at`:
  - **`create` (task already exists)**: handled by Step 1's existing-task
    check — append a `history` entry the normal way.
  - **`skip` or `declined`**: don't silently re-skip or re-decline. Re-run
    the full Step 3 categorization on the thread's current state — a
    message you declined because it was a vague FYI might now have someone
    directly asking you something in a new reply. If the new
    categorization lands on `queue`, add it back to the review queue
    (Step 4) with a note that it was previously declined/skipped and has a
    new reply since. Note this in the summary and append a line to
    `slack-decisions-log.md` recording the reopen, so the log stays an
    honest trail rather than silently overwriting the earlier entry.
  A message with no new reply since `at` is the only case that gets the
  free pass — don't apply this override speculatively to messages that
  genuinely haven't changed.

## Step 0 — resolve the existing review queue first

Before searching Slack, check for unresolved files in `vault/tasks/_inbox/`
named `slack-review-*.md` (format described in Step 4). For each file:

- For every line checked `[x]`, create the full task now (apply the
  Completeness rule below using the message details recorded in that
  line), then remove the line from the file. Append a line to
  `vault/tasks/_inbox/slack-decisions-log.md` recording this as an
  **accepted** decision (see the log format below) — this is the
  permanent log described in CLAUDE.md for review-queue decisions, one per
  source, so every accept/reject decision lives in one place regardless of
  whether it happened via the UI or by checking a box here.
- Leave every unchecked `[ ]` line in place — the user hasn't decided yet.
- If the file ends up with no lines left, delete it.
- **Decline detection.** Compare this file's current unchecked lines
  against `messages[]` entries in the state file with `decision: "queue"`.
  If a message was queued in a prior run but its line no longer appears in
  *any* `slack-review-*.md` file and no task exists for it, the user
  removed it by hand without checking it — record `decision: "declined"`
  for that message (today's date) in the state file, and append a
  **declined** line to `slack-decisions-log.md` the same way.

**Log format** (create `slack-decisions-log.md` with a one-line header if
it doesn't exist yet; always append, never overwrite or reorder existing
lines):

```
- [x] <message summary> — accepted, created task <task-id> — slack:<channel>:<ts>, from:<sender> — <ISO timestamp>
- [ ] <message summary> — declined — slack:<channel>:<ts>, from:<sender> — <ISO timestamp>
```

This file is a permanent record, not a queue — never re-parse it as
pending items, and never delete lines from it.

Report how many were promoted from the queue (and any newly-detected
declines) before moving on to Step 1.

## Step 1 — load existing tasks

List `vault/tasks/*.md` and read each file's frontmatter to build a set of
known `source.externalId` values (`slack:<channel>:<ts>`, using the
message's permalink-derived channel + timestamp as the dedup key — a
Slack permalink like `https://workspace.slack.com/archives/C123/p456789`
encodes both). Check every message found below against this set — if a
task already exists for a message, skip creating a new file; only touch it
if something meaningfully changed (a new reply in the thread), appending a
`history` entry rather than recreating the file.

## Step 2 — search Slack

If a Slack MCP tool isn't already loaded, use ToolSearch (e.g.
`search_messages`, `get_thread`, `list_channels` — verify actual names
once the connector is authorized, see the note at the top). Search for:

- Messages that directly `@mention` the user.
- Messages the user has starred/saved (Slack's native "save for later"),
  if the connector exposes that as a distinct search.
- Direct messages (1:1 DMs) where the last message is from the other
  person, i.e. awaiting the user's reply.

Cover the last ~14 days unless the user gives a different range, or Step
-1's narrowed window applies (the common case for a routine daily/morning
run).

## Step 3 — categorize every new message

**Skip outright** (no task, no queue entry, not mentioned individually in
the summary beyond a count) when the message is:

- A bot/integration notification with no personal ask (build status pings,
  automated channel digests, deploy notifications, standup-bot reminders
  with nothing specific asked of the user).
- A channel-wide FYI/announcement with no personal action implied (a
  broadcast to a large channel, a general heads-up), *unless* it has a
  deadline or requires the user to do something specific — those go to
  create/queue instead.
- An emoji-only or purely social reply (thumbs-up, "lol", "nice one") with
  no actionable content, even if it @-mentions the user.
- A thread that's already visibly resolved (e.g. the last message in the
  thread is the user's own reply, or someone else's confirmation that
  closes the loop) with nothing further asked.

**Create directly** (high enough confidence to skip the queue) when:

- A specific person directly `@mention`s the user asking for something
  concrete — a decision, a review, an answer, access — even if terse.
- A DM is awaiting the user's reply and the other person's last message
  contains a clear question or request.
- The user has starred/saved the message themselves — that's an explicit
  signal they want it tracked, treat it the way Gmail's "starred" flag is
  treated.
- The user has previously told you a specific sender's or channel's
  messages on a topic are something they explicitly asked for or care
  about (see Step 3a).

**Queue for confirmation** (append to the review file, see Step 4)
everything else that doesn't clearly fit skip or create — most often:

- Content shared with no stated purpose (a link, a screenshot, "check
  this out") where you can't tell from the message alone whether the user
  wants it tracked as a task.
- FYI/status-update messages that might be worth keeping for the user's
  own record but carry no explicit ask.
- A mention in a busy group channel where the ask is unclear or buried in
  a long thread.
- Anything you're genuinely unsure about — when in doubt, queue, don't
  skip and don't create.

### Step 3a — learned overrides

If the user has told you (in this conversation or a prior one) that
messages from a specific person, or about a specific topic/channel,
should always be created or always be skipped — treat that as a standing
rule for future runs, not a one-time judgment call. When you apply a
learned override, say so in the summary (e.g. "created per your standing
note that anything from Josh in #eng-alerts should become a task") so the
user can correct it if it's drifted from what they meant.

### Step 3b — staleness override (backfills / wide date ranges)

When running over a range that isn't "the last ~14 days" (a backfill,
catch-up, or explicit month/quarter), a message that would otherwise
qualify as create/queue may already be moot by *today's* date — a
deadline that's long past with no sign it's still open, an event that
already happened, a request superseded by a later message. Skip these
rather than creating a stale task, but call them out in the summary
separately from the normal skip categories (one line each, with why).

Do not apply this reflexively to every old message — check whether the
thread's later replies actually resolved it first.

## Step 4 — write the review queue

For every **queue** message, append a line to
`vault/tasks/_inbox/slack-review-<today>.md` (create the file if it
doesn't exist, with a one-line header explaining it's a pending-review
list):

```
- [ ] <message summary> — <one-line reason it's ambiguous> — slack:<channel>:<ts>, from:<sender>
```

Don't create a task for these now. Tell the user at the end of the run
that a review file is waiting and roughly how many items are in it —
checking boxes and re-running `/sync-slack` promotes them (Step 0).

## Completeness rule (do not skip)

Every task file this skill creates — whether directly in Step 3 or
promoted from the queue in Step 0 — must have every required frontmatter
field genuinely filled in — `id`, `title`, `status`, `priority`, `created`,
`tags`, `source` (`type: slack`, `externalId`, `url`), `history`. None of
these may be a guessed placeholder:

- `title` — a short paraphrase of the message's ask, e.g. "Reply to Sarah
  in #design about button copy" — never a generic placeholder.
- `priority` — infer from real signal only (urgency language, a stated
  deadline, a DM vs. a low-traffic channel mention). If there's no real
  signal, default to `medium` — that's a legitimate default here, not a
  placeholder, but don't reach for `high`/`urgent` without evidence.
- `due` — only set if the message actually states or clearly implies a
  date. Otherwise omit it.
- `tags` — derive from the channel name and message content/participants.
  If genuinely nothing is inferable, use `[]`.
- `source.url` — the Slack permalink for the message (fetch/construct it
  via the MCP tool rather than guessing the URL format).
- **Quote every ISO timestamp** (`created`, `due`, `completedAt`, every
  `history[].at`) in single quotes, e.g. `created: '2026-08-01T09:08:35+08:00'`.
  An unquoted timestamp gets parsed as a YAML native Date instead of a
  string, and the server's task list crashes on `.localeCompare` when it
  hits one.
- body — a real summary of the message's actual content and thread
  context, not a boilerplate sentence.

If you cannot determine `title` with confidence, don't create the file —
note it in the summary instead.

## Step 5 — persist sync state

Before reporting the summary, write back to `.data/sync-state.json`:

- Set `slack.lastRunAt` to now.
- For every message classified this run (create/skip/queue/declined),
  upsert its entry in `slack.messages`. Recording the skip-category
  decisions is the main point of this step — it's what lets the *next*
  run avoid re-reading and re-classifying known noise (bot pings, resolved
  threads, etc.) at all.
- Leave entries for messages not seen this run untouched — don't prune;
  they're cheap to keep and pruning risks re-processing something that
  scrolled out of the current search window.

## Notes

- This skill only ever creates or updates files under `vault/tasks/` (plus
  its own `_inbox/` review files, including the permanent
  `slack-decisions-log.md`) and `.data/sync-state.json` — it never deletes
  tasks, even if the source message disappears. Leave that judgment to the
  user.
- **One-way/read-only.** Never call a Slack posting, reacting, or editing
  tool from this skill (`post_message`, `chat.postMessage`, `add_reaction`,
  etc.) — this skill only ever reads. Mirrors `sync-jira`'s one-way-sync
  rule and `draft-followups`'s never-auto-send boundary.
- If the Slack MCP connection isn't available or not yet authorized in the
  current session, say so plainly and stop — don't fabricate tasks.
- Report a short summary at the end: tasks promoted from the queue, tasks
  created this run, tasks updated vs. left untouched, messages skipped (by
  category, with a count — not each one individually), how many messages
  were skipped silently via cached state vs. freshly classified this run,
  any newly-detected declines, any previously skipped/declined messages
  that got a new reply and were re-opened/re-classified (one line each —
  old decision, new decision, why), how many new items are waiting in the
  review queue, and any staleness-override skips (Step 3b, one line each
  with why).
