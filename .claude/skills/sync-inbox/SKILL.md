---
name: sync-inbox
description: Pull starred/important Gmail threads and Jira issues assigned to the user into vault/tasks/, using this session's existing Gmail and Atlassian MCP connections. Use when the user runs /sync or asks to refresh their tasks from email/Jira.
---

# sync-inbox

Populates `vault/tasks/` from Gmail and Jira using MCP tools that are
already connected in this Claude session — no OAuth setup, no API tokens,
nothing to configure. Read `../../CLAUDE.md` first for the task file schema
and the dedup rule before writing anything.

## Steps

1. **Load existing tasks.** List `vault/tasks/*.md` and read each file's
   frontmatter to build a set of known `source.externalId` values. You'll
   check every new item against this set before creating a file.

2. **Gmail.** If a Gmail MCP tool isn't already loaded, use ToolSearch (e.g.
   `search_threads` / `get_thread` / `get_message`) to find it. Search for
   starred or important threads (e.g. `is:starred OR is:important`) from the
   last ~14 days. For each thread:
   - Dedup key: `thread:<threadId>`.
   - If a task with that `source.externalId` already exists, skip creating a
     new file. Only touch it if something meaningfully changed (e.g. the
     thread got a new reply) — then append a `history` entry, don't
     recreate the file.
   - Otherwise create `vault/tasks/<today>-<shortid>.md` with:
     - `title`: the thread subject.
     - body: the snippet/summary of the thread.
     - `source: { type: gmail, externalId: "thread:<id>", url: <gmail link> }`
     - `status: open`, `priority: medium` (default — don't over-guess),
       `created`: now, `history: [{at: now, event: created}]`.

3. **Jira.** If a Jira/Atlassian MCP tool isn't already loaded, use
   ToolSearch (e.g. `searchJiraIssuesUsingJql`, `getJiraIssue`). Run JQL:
   `assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC`.
   For each issue:
   - Dedup key: the issue key itself, e.g. `PROJ-123`.
   - Same dedup logic as Gmail: skip/update-in-place if it already exists.
   - New task fields: `title` = issue summary, body = issue description,
     `source: { type: jira, externalId: "PROJ-123", url: <issue link> }`,
     `priority` mapped from the Jira priority field if present, else
     `medium`.
   - **One-way sync only.** Never call a Jira transition/update tool from
     this skill — moving a card in the local board must never change real
     Jira state.

4. **Report a short summary** at the end: how many new tasks were created
   from Gmail, how many from Jira, and how many existing tasks were updated
   vs. left untouched. Don't print the full list unless asked.

## Notes

- This skill only ever creates or updates files under `vault/tasks/` — it
  never deletes tasks, even if the source email/issue disappears or is
  resolved. Leave that judgment to the user.
- If neither MCP connection is available in the current session, say so
  plainly and stop — don't fabricate tasks.
