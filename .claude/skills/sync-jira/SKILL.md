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

## Steps

1. **Load existing tasks.** List `vault/tasks/*.md` and read each file's
   frontmatter to build a set of known `source.externalId` values.

2. **Search Jira.** If an Atlassian MCP tool isn't already loaded, use
   ToolSearch (e.g. `searchJiraIssuesUsingJql`, `getJiraIssue`). Run JQL:
   `assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC`.
   For each issue:
   - Dedup key: the issue key itself, e.g. `PROJ-123`.
   - If a task with that `source.externalId` already exists, skip creating a
     new file. Only touch it if something meaningfully changed (status,
     description, priority in Jira) — then append a `history` entry, don't
     recreate the file.
   - Otherwise, gather everything needed for a **complete** task (see
     Completeness rule below) before creating
     `vault/tasks/<today>-<shortid>.md`.

## Completeness rule (do not skip)

Every task file this skill creates must have every required frontmatter
field genuinely filled in — `id`, `title`, `status`, `priority`, `created`,
`tags`, `source` (`type`, `externalId`, `url`), `history`. None of these may
be a guessed placeholder:

- `title` — the issue summary field, verbatim.
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
- body — the issue description (or a faithful summary of it if very long),
  not a placeholder sentence.

If `title` can't be read from the issue (shouldn't happen), skip that issue,
note it in the summary, and move on rather than writing an incomplete task.

## Notes

- This skill only ever creates or updates files under `vault/tasks/` — it
  never deletes tasks, even if the Jira issue is later closed or deleted.
  Leave that judgment to the user.
- If the Atlassian MCP connection isn't available in the current session,
  say so plainly and stop — don't fabricate tasks.
- Report a short summary at the end: how many new tasks were created, how
  many existing tasks were updated vs. left untouched, and any issues
  skipped for incompleteness.
