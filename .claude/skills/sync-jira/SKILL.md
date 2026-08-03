---
name: sync-jira
description: Pull Jira issues assigned to the user into vault/tasks/, using this session's existing Atlassian MCP connection. Use when the user runs /sync-jira or asks to refresh their tasks from Jira.
---

# sync-jira

Populates `vault/tasks/` from Jira using MCP tools that are already
connected in this Claude session — no OAuth setup, no API tokens, nothing
to configure. Read `../../CLAUDE.md` first for the task file schema and the
dedup rule before writing anything. This skill only ever touches
`vault/tasks/` and never writes to `vault/notes/` or `vault/meetings/`.

**One-way sync only.** Never call a Jira transition/update/comment tool
from this skill — moving a card on the local board must never change real
Jira state.

**Be terse.** Every task this skill writes must read like the Completeness
rule's `title`/body guidance below — `<KEY> <brief description>, <next
action>` titles and a short paraphrased body, never the raw Jira summary
or a copy-pasted ticket dump. This applies to every issue this skill
creates or updates, not just the ones a user happened to ask about — don't
regress to verbatim-summary titles or full description dumps once this
conversation ends.

**Dedup is strict and checked continuously, not just at the start.** A
past run created the same issue as two separate task files multiple
times in a single sync — build the known-`externalId` set in Step 1, but
also add each issue's key to that same in-memory set **the moment its
file is written**, and check every subsequent issue (including ones later
in the same search results) against the updated set before creating
anything. Never batch all the creates first and check for collisions
after. See Step 2's verification pass for a second line of defense.

## Steps

1. **Load existing tasks.** List `vault/tasks/*.md` and read each file's
   frontmatter to build a set of known `source.externalId` values.

2. **Search Jira.** If an Atlassian MCP tool isn't already loaded, use
   ToolSearch (e.g. `searchJiraIssuesUsingJql`, `getJiraIssue`). Run JQL:
   `assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC`.
   For a backfill or explicit date range, instead scope with
   `assignee = currentUser() AND updated >= "<range-start>" AND updated <= "<range-end>" ORDER BY updated ASC`
   (don't restrict to `resolution = Unresolved` for a backfill — resolved
   issues in the range still need the staleness check in Step 3 below so
   they can be reported, not silently missed).
   Include `comment` in the requested `fields` (alongside the defaults) —
   the title/body need the latest comment to state a concrete next
   action (see Completeness rule).
   For each issue:
   - Dedup key: the issue key itself, e.g. `PROJ-123`. Check this against
     the full set loaded in Step 1 **before creating anything** — this
     applies within a single run too, not just across runs. If two issues
     returned by the same search share a key (shouldn't happen, but JQL
     pagination or a re-run mid-sync can double it up), only ever write one
     file for it.
   - If a task with that `source.externalId` already exists, skip creating a
     new file. Only touch it if something meaningfully changed (status,
     description, priority in Jira) — then append a `history` entry, don't
     recreate the file.
   - **Known scattered-initiative issues — recency check, every run, not
     just backfills.** Some work spans whichever project it happened to be
     filed under, not one project key — currently known initiatives:
     - **Analytics** (`GA-*`, `DSG-*`, and plain `CORE-*` have all hosted
       it) — still active overall, so check per-issue, don't skip
       wholesale. Identify by the issue's own summary starting with/
       containing "Analytics" (`Core_Analytics`, `Core Analytics`,
       `General Analytics`, `DSG Analytics`, etc.), **or** — for an
       otherwise generic-looking subtask (e.g. `Dev: Dealer Page`, `API:
       Visitors`) — its parent epic/story summary does.
     - **Team Store** (`CORE-*`) — the whole initiative reads as dormant
       (last touched ~early 2025, stuck in `FOR REFINEMENT`) — treat any
       issue whose own or parent summary matches "Team Store"/
       "Core_TeamStore" the same as a stale hit unless something concrete
       says otherwise (recent update, active status).
     For either: identify by content, not project prefix, checking the
     parent epic/story when the issue itself doesn't obviously read as a
     match. Skip creating a task only when the issue is both old and
     dormant: `updated` more than ~60 days ago **and** current status/
     latest comment shows no real activity (no in-progress work, no recent
     comment, sitting in a testing/review/backlog limbo like `CORE PROD
     TESTING`, `FOR PM VALIDATION`, `FOR REFINEMENT`, `UAT`, `ON HOLD`).
     A recently-updated or currently-in-progress issue in either
     initiative still gets a task exactly like any other project. Note
     skipped-as-dormant issues in the summary (one line each, issue key +
     last-updated date) rather than silently dropping them.
   - Otherwise, gather everything needed for a **complete** task (see
     Completeness rule below) before creating
     `vault/tasks/<today>-<shortid>.md`. Immediately add its `externalId`
     to the in-memory dedup set (see the "Dedup is strict" note above)
     before moving to the next issue.

   **Verification pass (do this before reporting the summary).** After
   all issues are processed, re-list `vault/tasks/*.md` and group by
   `source.externalId`. If any non-null key appears more than once —
   including ones that existed before this run — that's a dedup failure:
   keep whichever file has the more complete `history` (more entries, or
   the more recently-updated one if tied) and delete the other(s). Note
   any duplicates found and removed in the summary; if none, say so
   explicitly rather than skipping the line.

## Step 3 — apply the staleness override (backfills / wide date ranges)

When running over a range that isn't "assigned + currently unresolved" (a
backfill, catch-up, or explicit month/quarter), an issue that would
otherwise qualify as create/update may already be moot by *today's* date —
resolved, closed, or superseded since the range was current. Skip creating
a task for these, but call them out in the summary separately from normal
skip categories (one line each, with why).

Don't apply this reflexively to every old-looking issue — check the
issue's actual current status and latest comment before deciding it's
stale. An issue that looks old by creation date can still be genuinely
open; conversely a recently-updated issue can already be resolved.

- **Known scattered-initiative issues (Analytics, Team Store)**: see the
  recency check in Step 2 (applies here too, over the wider backfill
  range) — identify by summary content or parent-epic summary, not
  project key, and check whether each individual issue is old-and-dormant
  rather than treating the whole initiative or a whole project as stale.
- **Recognition/rewards signal**: if an issue or its comments show one of
  the user's direct reports (Joseph Cruz, Adonis Suico, Chris Dismaya,
  Reggienel Patawaran) resolving something notable, getting called out by
  name in a comment, or otherwise being recognized — don't just skip it.
  Add a short note to that person's `vault/notes/<person>.md` (what
  happened, when, source issue key) so it surfaces at EPEP review / 1:1
  time. Say in the summary who (if anyone) was found, even if no one was.
  - **Critical/prod-breaking resolutions always count as recognition-worthy.**
    `Highest`/`High` priority alone is not the signal — those fields are
    routinely overused and don't reliably mean prod-breaking. Instead look
    for:
    - A dedicated **Critical** status/severity value on the issue (distinct
      from the normal priority field), or
    - **"Urgent"/"URGENT"** appearing in the issue title, or
    - Comments indicating a **hotfix** was involved (an out-of-cycle
      deploy, an emergency patch, language like "hotfix", "pushed
      immediately", "patched to prod" rather than the normal STG→UAT→PROD
      testing cadence).
    If a direct report resolved one of these, that's recognition-worthy on
    its own, even with no praise or callout in the comments. Note it the
    same way: what broke, what they fixed, whether a hotfix was needed,
    when, source issue key. This applies whether the ticket surfaced from a
    backfill pass or the Step 4 active-ticket roundup — check recently-
    resolved critical tickets there too, not just what's still active.
- **Long-running tickets/epics**: if the same issue or epic keeps
  reappearing across multiple months in the backfill without resolution,
  don't dismiss it as stale just because it's old. Check whether it's a
  genuinely still-active workstream — pull the real current status and
  next action into a task and/or update the relevant `vault/notes/`
  project hub, the way the General Analytics IDV dashboard turned out to
  be live rather than stale. Only override-skip a long-running ticket if
  its current status and latest comment actually read as resolved/closed.
- **Duplicate-in-spirit check**: before creating or updating, check
  whether an existing task already tracks the same underlying issue in
  spirit (e.g. a recurring reminder for the same recurring problem) — don't
  create a second task for it even if the `source.externalId` differs.

## Step 4 — direct-report active-ticket roundup (live snapshot, not backfill)

In addition to the user's own assigned issues, also check what's currently
active for the user's direct reports (Joseph Cruz, Adonis Suico, Chris
Dismaya, Reggienel Patawaran) — not to create tasks for their individual
tickets (that's their work, not the user's), but to compile a per-person
check-in list the user reviews at 1:1s.

This is a **live current-state snapshot**, not something to walk month by
month during a backfill — "aging/active" is a question about right now.

- JQL: `assignee in (<report accountIds>) AND project != GA AND status not
  in ("Done", "Deferred", "INVALID/CANCELED", "INVALID") ORDER BY assignee
  ASC, updated ASC`. Drop GA/analytics-project tickets entirely — they cycle
  through UAT/testing constantly and aren't a useful signal for this.
- **Drop genuinely dormant tickets, don't list them.** A ticket that hasn't
  been updated in months (e.g. legacy CORE-2xxx tickets stuck in "CORE PROD
  TESTING" since early-to-mid 2025) is bookkeeping debt, not something the
  report is actively working — leave it out of the roundup entirely rather
  than calling it out as a hygiene item. Only surface tickets with genuinely
  recent activity (roughly the last 1-2 months).
- For each direct report with at least one qualifying active ticket,
  maintain **one task per person**, dedup'd on
  `source.externalId: "direct-report-tickets:<person-slug>"` — update the
  same file in place each run (replace the ticket list and `title`, append a
  `history` entry) rather than creating a new file every sync.
  - `title` format: `Check on <FirstName>'s active tickets: <KEY>, <KEY>, ...`
  - Body: one bullet per ticket — key, one-line summary, current status,
    last-updated date.
  - If a person has zero qualifying tickets, don't create or keep a task for
    them (delete the file if one exists from a prior run and is now empty).
- This roundup never touches `vault/notes/` — recognition/rewards signal
  (Step 3) is the only direct-report thing that writes there.

## Completeness rule (do not skip)

Every task file this skill creates must have every required frontmatter
field genuinely filled in — `id`, `title`, `status`, `priority`, `created`,
`tags`, `source` (`type`, `externalId`, `url`), `history`. None of these may
be a guessed placeholder:

- `title` — **`<KEY> <brief description>, <what I need to do>`**, not the
  raw Jira summary verbatim and not the full description. Keep it to one
  line that's actually scannable on the board:
  - `<KEY>` — the issue key (e.g. `SRE-3041`).
  - `<brief description>` — a short paraphrase of what the issue is (a
    few words to a short clause — "Support ticket, Picker page displaying
    unavailable colors on twill items" — not the whole description
    dumped in).
  - `<what I need to do>` — the actual next action, derived from the
    issue's current status and its **most recent comment** (fetch
    `comment` in the fields list — see Step 2). If the latest comment is
    someone asking for something specific, name them and be concrete:
    "Shiela asked you three days ago to fill in the root cause and
    resolution fields." If there's no comment driving it, state the
    status-implied action instead ("needs triage", "waiting on your
    review before it can move to UAT"). Don't invent an action if the
    issue genuinely has neither — say "no clear next action yet" rather
    than fabricate one.
  - Example: `SRE-3041 Support ticket, Picker page displaying unavailable
    colors on twill items, Shiela asked you three days ago to fill in the
    root cause and resolution fields.`
- `status` — map Jira status to `open` (To Do/backlog-like), `in-progress`
  (In Progress/In Review-like), or `done`/`archived` for resolved states —
  don't default to `open` for an issue that's clearly already in progress.
- `priority` — map directly from the Jira `priority` field
  (Highest/High→`high` or `urgent` depending on Jira's own scale, Medium→
  `medium`, Low/Lowest→`low`). Only fall back to `medium` if Jira genuinely
  has no priority set on the issue.
- `due` — pull from Jira's `duedate` field if set; omit otherwise.
- `tags` — derive from the Jira project key/component/labels. If the issue
  has labels or a component, use those; don't invent tags.
- **Quote every ISO timestamp** (`created`, `due`, `completedAt`, every
  `history[].at`) in single quotes, e.g. `created: '2026-08-01T09:08:35+08:00'`.
  An unquoted timestamp gets parsed as a YAML native Date instead of a
  string, and the server's task list crashes on `.localeCompare` when it
  hits one.
- body — **a short summary, not the raw ticket dump.** A few sentences:
  what the issue actually is, in your own words, plus the specific ask/
  blocker from the latest comment (quote it if it's short) so you can
  verify the inference without having to open Jira. Do not paste the
  full Jira description field, environment/URL/brand boilerplate, or
  other support-ticket-template noise verbatim — link back with the
  `source.url` for anyone who needs the full original.

If `title` can't be read from the issue (shouldn't happen), skip that issue,
note it in the summary, and move on rather than writing an incomplete task.

## Notes

- This skill only ever creates or updates files under `vault/tasks/` — it
  never deletes tasks, even if the Jira issue is later closed or deleted.
  Leave that judgment to the user.
- If the Atlassian MCP connection isn't available in the current session,
  say so plainly and stop — don't fabricate tasks.
- Report a short summary at the end: how many new tasks were created, how
  many existing tasks were updated vs. left untouched, any issues skipped
  for incompleteness, any staleness-override skips (Step 3, one line each
  with why), any duplicates found and removed by Step 2's verification
  pass (or confirmation that none were found), any recognition/rewards
  found for a direct report (or none), and any long-running ticket that
  turned out to still be live.
