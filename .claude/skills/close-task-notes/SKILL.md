---
name: close-task-notes
description: When a task is marked done and its body/history holds real content worth keeping (decisions, follow-up context, what actually happened), propose routing a short excerpt into the relevant vault/notes/ file rather than letting it rot in a closed task. Use when the user runs /close-task-notes, says they just marked a task done and want its notes routed, or asks whether completing a task updates any notes.
---

# close-task-notes

There is no automatic hook that fires when a task's `status` flips to
`done` — completing a task (in the app UI or by hand-editing the file) is
purely a frontmatter change. This skill is the deliberate, on-request
step that looks at recently-completed tasks and asks whether anything in
them is worth keeping somewhere more durable than a closed task file.
Read `../../CLAUDE.md` first for the task schema and note conventions.

Most completed tasks have nothing worth propagating — a clean approval
confirmation, a merged PR with no discussion. Don't try to force every
`done` task through this; only ones with real body content (a decision,
an outcome, context someone would want at a later date) are candidates.

## Step 1 — find candidates

List `vault/tasks/*.md` with `status: done`. Read `.data/sync-state.json`'s
`noteRouting` key (`{ routed: { <taskId>: <ISO> } }`, treat as `{}` if
absent) — skip any task id already in `routed`, it's been through this
before. If the user named a specific task ("the flu vaccine one I just
closed"), just use that one instead of scanning everything.

For each remaining candidate, judge whether its body has real content:
skip silently (and record it in `routed` so it's not re-checked every
run) if the body is boilerplate/empty or just a one-line confirmation.
Keep it as a candidate if the body or `## History` holds an actual
decision, outcome, or something a person/project note would benefit from.

## Step 2 — find where it belongs

For each real candidate, look for a target using the task's `tags`,
title, and body content:
- A `type: person` note under `vault/notes/` matching a tag or a name
  mentioned in the body.
- A `type: hub` project note matching a tag/topic.
- If nothing matches clearly, don't force it — note in the queue that no
  target was found and let the user say where it should go instead.

## Step 3 — queue for confirmation

Don't write to `vault/notes/` directly. Append to
`vault/tasks/_inbox/notes-review-<today>.md` (create with a one-line
header if missing), one entry per candidate — **this exact format is
parsed by the app's Review Queue view** (`apps/server/src/vault/reviewQueue.ts`),
so the item shows up there (same screen as the Gmail review queue), not
just as a file the user has to remember to open:

```
- [ ] <task title> → [[<proposed-note-id>]] — <one-line excerpt of what would be added> — task:<task id>
```

If no target note was found, write `→ (no match — needs a destination)`
instead of a note link, so the user can supply one when reviewing (the
Review Queue view disables its "Apply to note" button for these — only
"Dismiss" works until a target is added by hand).

Tell the user how many entries are waiting and roughly what they cover,
and that they'll also see them in the app's Review Queue view.

## Step 4 — apply on confirmation

Applying is normally done in-app (Review Queue view → "Apply to note" /
"Dismiss" — this calls `reviewQueueRepository.promote`/`dismiss`, which
appends the excerpt under a dated `## Updates` heading in the target
note, records the task id in `.data/sync-state.json`'s
`noteRouting.routed`, and removes the line). If the user instead
hand-checks a box and asks you to apply it, do the same thing yourself:
append the excerpt to the target note, record the task id in
`noteRouting.routed`, remove the line from the queue file (delete the
file once empty), and append a line to
`vault/tasks/_inbox/notes-decisions-log.md`.

## Notes

- Never change a task's `status`/`completedAt` — this skill only reads
  completed tasks and writes to `vault/notes/`.
- Never invent a target note — an unmatched candidate stays unmatched
  until the user says where it goes.
- This is on-request, not part of `/morning` — completions happen at
  arbitrary times, not on a sync cadence.
