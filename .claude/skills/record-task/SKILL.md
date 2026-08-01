---
name: record-task
description: Turn freeform typed or dictated/voice-transcribed input into a single, fully-populated task file in vault/tasks/. Use when the user runs /record-task, dictates a task, or asks to jot down/capture a task manually rather than syncing one from Gmail/Jira/Calendar.
---

# record-task

Creates exactly one task file per invocation from manual or voice input —
`source.type: manual` for typed input, `source.type: voice` for anything
described as dictated/transcribed. Read `../../CLAUDE.md` first for the
task file schema. Unlike the sync skills, there's no external record to
dedup against here — the only dedup concern is the user accidentally
re-recording something they already captured (see step 3).

Manual capture has no source thread/issue/event to backfill missing
details from, so the completeness bar is stricter: **never invent a due
date, priority, or tag that the input didn't state or clearly imply.**

## Steps

1. **Parse the input** for: what the task actually is (title), any stated
   deadline, any stated urgency/importance, any project/topic context.
   Voice input especially may be a rambling sentence — extract the actual
   actionable ask, don't just transcribe it verbatim into `title`.

2. **Check for likely duplicates.** Grep `vault/tasks/*.md` titles for close
   matches. If something clearly overlapping already exists (same subject,
   still open), tell the user and ask whether this is an update to that
   task (append `history`) or a genuinely separate new one — don't silently
   create a duplicate, and don't silently skip either.

3. **Resolve every required field before writing anything:**
   - `title` — a concise action-oriented restatement of the ask.
   - `status` — always `open` for a newly recorded task (it hasn't been
     started).
   - `priority` — only set `high`/`urgent` if the input said so explicitly
     or unmistakably implied it ("this is urgent", "ASAP", "before EOD").
     Otherwise `medium`. Never guess `high` from tone alone.
   - `due` — only set if the input stated a date/time or an unambiguous
     relative one ("by Friday", "tomorrow") — resolve relative dates
     against today's date. If no deadline was mentioned, omit the field
     entirely; do not invent one.
   - `tags` — only from topics/projects actually named in the input. If
     none were named, use `[]`.
   - `source` — `{ type: manual | voice, externalId: null, url: null }` (no
     external record exists to link).
   - `created`, `history: [{at: now, event: created}]`.
   - **Quote every ISO timestamp** (`created`, `due`, `completedAt`, every
     `history[].at`) in single quotes, e.g.
     `created: '2026-08-01T09:08:35+08:00'`. An unquoted timestamp gets
     parsed as a YAML native Date instead of a string, and the server's
     task list crashes on `.localeCompare` when it hits one.

4. **If the input is too vague to produce a real `title`** (e.g. just
   "remind me about that thing"), ask the user a clarifying question rather
   than writing a placeholder task. This is the one case where you should
   stop and ask instead of proceeding.

5. **Write** `vault/tasks/<today>-<shortid>.md` with the resolved
   frontmatter and a body containing the original input verbatim (so the
   raw dictation/note is preserved even after you've distilled the title).

6. **Confirm back to the user** with the final title, status, priority, and
   due date (or "no due date set") so they can correct anything before it
   sits in the board.

## Notes

- This skill never touches `vault/notes/`, `vault/meetings/`, or any
  external system — it only writes one task file (or updates one, per step
  2) under `vault/tasks/`.
- If the user gives multiple distinct tasks in one dictation, split them
  into separate files rather than merging into one task with a list body.
