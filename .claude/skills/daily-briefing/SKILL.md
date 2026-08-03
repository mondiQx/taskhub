---
name: daily-briefing
description: Read-only summary of what needs attention right now — overdue/due-soon tasks, today's meetings, and anything newly queued for review. Use when the user runs /briefing, asks "what do I need to do today", or as the last step of the /morning routine after the sync skills have run.
---

# daily-briefing

Produces a short, skimmable briefing from the vault as it currently stands.
This skill never writes to Gmail/Jira/Calendar and never sends anything —
it only reads `vault/tasks/`, `vault/meetings/`, and `vault/tasks/_inbox/`,
and writes one file. Read `../../CLAUDE.md` first for the task/meeting
schema.

Run this *after* the sync skills (sync-gmail, sync-jira, sync-calendar) so
the briefing reflects the latest pulls, not stale state — but it's safe to
run standalone at any time too.

## Step 1 — gather

- List `vault/tasks/*.md`, read frontmatter for every file with
  `status: open` or `status: in-progress`.
- Split into: **overdue** (`due` < now), **due today/tomorrow**, **urgent or
  high priority with no due date**, everything else (count only, don't list
  individually unless there are fewer than ~8 total open tasks).
- List `vault/meetings/*.md` for events starting today; note any with a
  linked task whose `relatedMeeting.reminderFired` is still `false`.
- Check `vault/tasks/_inbox/*.md` for unresolved review-queue files from any
  sync skill and count pending lines.

## Step 2 — write the briefing

Write to `vault/journal/<today>.md` under a `## Briefing — <time>` heading
(append if the file already has entries for today, don't overwrite earlier
journal content). Structure:

```
## Briefing — <HH:MM>

### Overdue
- <title> (due <date>) — <link to file>

### Today
- <meeting time> <meeting title>
- <task due today>

### Needs a decision
- <n> items waiting in <inbox file> — review queue from <skill>

### Everything else
- <n> other open tasks (no action needed right now)
```

Omit any section that's empty rather than printing "None".

## Step 3 — report

Print the same briefing to the user directly (don't make them open the
file) and mention where it was saved.

## Notes

- Never invent urgency — a task's priority/due date comes from its own
  frontmatter, not from guessing.
- If `vault/tasks/` or `vault/meetings/` doesn't exist yet or is empty, say
  so plainly rather than fabricating a briefing.
