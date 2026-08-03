---
name: draft-followups
description: Prepare Gmail drafts (never sent automatically) and Jira comment text for tasks that are stalled and need a nudge. Use when the user runs /draft-followups, asks for help following up on stuck items, or as a step in the /morning routine after daily-briefing.
---

# draft-followups

Finds tasks that look stalled and prepares a follow-up message for each —
but **never sends anything**. Gmail messages become drafts via the Gmail
MCP `create_draft`/`update_draft` tools; Jira nudges are written as
ready-to-paste comment text, not posted via `addCommentToJiraIssue`. The
user reviews and sends/posts manually. This is a deliberate safety
boundary — do not add an auto-send path even if asked to "just automate
it fully" without the user explicitly overriding this in writing.

Read `../../CLAUDE.md` first for the task schema.

## Step 1 — find candidates

From `vault/tasks/*.md` with `status: open` or `in-progress`, a task is a
follow-up candidate if:

- `due` is past, or within the next 2 days, **and**
- the most recent `history` entry is older than ~5 days (nothing has moved),
  **and**
- `source.type` is `gmail` or `jira` (has an external thread/issue to
  follow up on — `manual`/`voice` tasks aren't followed up this way).

Skip anything `status: done` or `archived`, and skip a task if its latest
`history` entry already says a follow-up was drafted (avoid duplicate
drafts across daily runs — check for an event like `event: followup-drafted`
before creating another).

## Step 2 — prepare the follow-up

**Gmail-sourced tasks**: use `source.externalId` (`thread:<id>`) to pull the
thread via the Gmail MCP `get_thread` tool, then `create_draft` a short,
polite reply in-thread referencing the specific ask and how long it's been
open. Keep it brief — one paragraph, no filler.

**Jira-sourced tasks**: use `source.externalId` (the issue key) to pull
current status via `getJiraIssue`. Write the suggested comment text into
the task's body under a `## Suggested follow-up` heading — do not call
`addCommentToJiraIssue`. Include the issue key so the user can paste it in
directly.

## Step 3 — record it

Append a `history` entry to the task: `event: followup-drafted`, with a
note naming where the draft landed (Gmail draft id, or "see Suggested
follow-up in body"). Keep frontmatter `history` and the body `## History`
section in sync per the schema in CLAUDE.md.

## Step 4 — report

List what was drafted (task title → draft location) and what was skipped
and why (already drafted recently, no external thread, etc). End with a
one-line reminder: "These are drafts only — nothing was sent."

## Notes

- If the Gmail or Atlassian MCP connection isn't available, say so and
  skip that source rather than fabricating a draft.
- Never mark a task `done` or change its `status` — drafting a follow-up
  doesn't resolve anything.
