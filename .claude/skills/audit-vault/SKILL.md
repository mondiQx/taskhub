---
name: audit-vault
description: Find thin/stub files across vault/tasks, vault/notes, and vault/meetings, then enrich them in confirmed batches using Gmail/Jira/Calendar context and anything dropped in vault/raw/. Use when the user asks to audit, densify, or fill out the whole vault (not just meetings), or mentions vault/raw/ source material.
---

# audit-vault

Distinct from `enrich-vault`: that skill autonomously writes
`vault/notes/` + `vault/meetings/` from Gmail/Calendar notetaker emails
without stopping for confirmation. This skill is interactive and broader —
it covers `vault/tasks/`, `vault/notes/`, and `vault/meetings/` all
three, pulls from `vault/raw/` (images/PDFs/docs the user drops in), and
**never writes a file without showing the user the proposed change first**.
Read `../../../CLAUDE.md` for the task schema and folder conventions
before starting.

## Step 1 — Survey and scope

1. List every file under `vault/tasks/`, `vault/notes/`, `vault/meetings/`,
   and `vault/raw/`.
2. For each vault file, flag it "thin" using cheap heuristics — no need to
   read full content yet, just enough to triage:
   - Body under ~3 lines / mostly empty after frontmatter.
   - Notes: missing a `## Currently`/narrative section, or just a title +
     one tag line (like a bare person stub).
   - Meetings: no `notetakerSource` field and a body that's just a
     `## Participants` list or a raw calendar description/Zoom link.
   - Tasks: body with no discussion, or `history` with only a single
     `created` entry on an old, still-open task (suggests it's gone stale
     without anyone updating it here).
3. **Stop and confirm scope with the user before doing any deep work.**
   Report the thin-file count per folder and ask:
   - Which folder(s) to prioritize (tasks / notes / meetings / all).
   - Any date range or subset (e.g. "just direct reports," "just Q1").
   - Preferred batch size (default 5–8 files per batch is reasonable —
     large enough to be efficient, small enough to review in one sitting).
   Do not guess this — it directly determines how much work happens
   before the user sees anything.

## Step 2 — Check vault/raw/ first

Before touching Gmail/Jira/Calendar, look at what's sitting in
`vault/raw/`. Anything there was deliberately placed by the user as
source material:
- Images (screenshots, whiteboard photos) and PDFs can be read directly
  with the Read tool — it handles both natively.
- Match raw files to vault files by filename hints, dates, or content
  (e.g. a screenshot of a Jira board relates to specific task IDs; a photo
  of meeting notes relates to a specific date/title).
- If a raw file doesn't obviously match anything, ask the user what it's
  for rather than guessing or ignoring it.
- Once a raw file has been used to enrich a vault file (and the user has
  confirmed the write in Step 4), ask whether to delete it from
  `vault/raw/` — don't delete unprompted.

## Step 3 — Gather context per batch

For each file in the current batch, pull whatever real context exists
before drafting anything:
- **Tasks** — if `source.type` is `gmail` or `jira`, re-fetch that thread
  (`mcp__claude_ai_Gmail__get_thread`) or issue
  (`mcp__claude_ai_Atlassian__getJiraIssue`) via `source.externalId`/URL
  for fuller detail than what's currently in the file.
- **Meetings** — search Gmail for Fireflies/Gemini notetaker recap emails
  matching the meeting title/date (same patterns as `enrich-vault`'s data
  sources section), and cross-reference
  `npm run calendar:range -w apps/server -- --from <date> --to <date> --q "<title>"`
  for attendees/recurrence.
  - **People notes** — search Gmail/Jira/Calendar for that person's name
  to find recent interactions, project involvement, or context not
  already captured — but don't fabricate performance judgments; only add
  what's actually evidenced.
- If nothing turns up for a file, say so plainly in the batch summary
  rather than inventing content.

## Step 4 — Propose, don't write

For every file in the batch, show the user:
- The file path.
- What context was found (source + a one-line gist).
- The proposed new body / frontmatter additions (as text, not yet
  written to disk).

If context is ambiguous, contradictory, or you're inferring something
non-obvious (e.g. guessing at a task's priority, or which of two similar
meetings a stray email refers to), **ask the user directly** instead of
picking an interpretation. Batch these clarifying questions together
rather than trickling them out one at a time.

Only after the user confirms (per-file or per-batch, whichever they
prefer) do you write. When writing:
- Tasks: preserve the schema in `CLAUDE.md` exactly — append to the
  frontmatter `history` array AND mirror it in the body `## History`
  section, keep `id`/`source`/`status` intact unless the user says
  otherwise.
- Meetings: preserve existing frontmatter (`eventId`, `source: gcal`,
  etc.) per `enrich-vault`'s enrich-in-place rule; add
  `notetakerSource` if real notetaker content was found.
- Notes: keep existing `[[wikilinks]]` and add new ones where the
  enrichment naturally references other people/notes/tasks.

## Step 5 — Report and continue

After each batch is written, give a short summary (files enriched, files
skipped and why, raw/ files consumed) and ask whether to continue to the
next batch or stop here.
