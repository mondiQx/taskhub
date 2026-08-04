---
name: journal
description: Capture a raw, mixed-topic brain dump (typed or dictated) safely — write it verbatim to today's journal first, then propose (never silently apply) task updates, meeting recaps, new tasks, and delegations extracted from it. Use when the user runs /journal, says "this is my journal for X", or dumps a mishmash of unrelated updates/thoughts in one go rather than a single clean task/update request.
---

# journal

For the free-form, multi-topic dumps Raymond drops into a session —
"finish X tomorrow, reschedule Y, delegate Z to so-and-so, oh and here's
what happened in this meeting, also I'm annoyed about the salary freeze."
One message like this usually contains several *different* kinds of
content that belong in different places. This skill's job is to never
lose any of it, and to never silently guess wrong on the ambiguous parts.

Read `../../CLAUDE.md` first for the task/journal folder schema.

## Step 0 — resolve the existing review queue first

Before processing new input, check for an unresolved
`vault/tasks/_inbox/journal-review-<today>.md` (or an earlier date's file
still present). For every line checked `[x]`, apply the proposed change
exactly as written on that line (edit the referenced task/meeting file),
then remove the line. Leave every `[ ]` line in place — the user hasn't
decided yet. If the file ends up empty, delete it.

Report how many were promoted from the queue before moving on.

## Step 1 — write the raw dump verbatim, always, first

Append the user's input, unedited, to `vault/journal/<today>.md` under a
`## Journal` heading (create the file if it doesn't exist). This happens
unconditionally, before any interpretation — it's the ground truth record,
independent of whatever gets extracted or how well the extraction goes.

If the input contains content that reads as personal/reflective rather
than actionable (career interests, frustrations, general venting, morale) —
add it to a `## Personal notes` section in the same journal file instead of
folding it into a task or meeting note. This is deliberately *not* part of
any task schema and nothing else in the vault reads this section — it's a
private, searchable record for the user's own reference (e.g. "when did I
last raise eTEAAP").

## Step 2 — split the dump into candidate items

Read through the raw input and identify each distinct thing being said.
Do not merge unrelated items into one entry. Classify each into one of:

- **Task field update** — a status/priority/due-date change, a delegation,
  a reassignment, on a task that (probably) already exists.
- **New task** — a genuinely new actionable item with no existing file.
- **Meeting recap** — factual content about a meeting that already
  happened, belongs appended to that meeting's note under `vault/meetings/`.
- **Bug/observation about the app itself** — not vault content, becomes a
  new low-priority task tagged `bug`.
- **Personal/reflective** — handled in Step 1, not a task.

For "task field update" and "meeting recap" items, you must identify
*which* existing file the user means. Resolve fuzzy references ("the SRE
tickets", "the IDV meeting") the same way you would for any other request
— search titles/tags/content in `vault/tasks/` and `vault/meetings/`.

## Step 3 — propose, don't apply

For every candidate item, write one line to
`vault/tasks/_inbox/journal-review-<today>.md` (create it if it doesn't
exist, with a one-line header explaining it's pending confirmation):

```
- [ ] <plain-language description of the proposed change> — target: <file path or "new task">
```

Be concrete about the resolved target so a wrong match is obvious at a
glance — e.g. `target: vault/tasks/2026-08-03-OyErcN.md (SRE-3069 AXE
customizer PDF ticket)`, not just `target: the SRE task`. This is the
step that exists specifically to catch mis-resolved references before
they mutate a file — if a line names the wrong task, the user can just
leave it unchecked (or edit the line) instead of the change happening
silently.

**Exception — do not queue what's unambiguous.** If a reference is
unmistakable (only one plausible match, or the user gave an exact title/ID),
you may apply it directly instead of queueing, the same way sync-gmail
creates directly for confident matches. Queue only genuine ambiguity —
when in doubt, queue, don't guess.

## Step 4 — report

Tell the user: how many items were written straight to the journal
(and, separately, to personal notes), how many were applied directly as
confident changes, and how many are waiting in the review queue for
confirmation (with a one-line summary of each so they don't have to open
the file to decide).

## Notes

- This skill never deletes or overwrites journal content — only appends.
- The review queue file lives under `vault/tasks/_inbox/` alongside
  `gmail-review-*.md`, following the same promote-on-checkbox convention.
- If the same ambiguous reference comes up again in a later dump and the
  user has since corrected a prior mis-resolution, treat that correction
  as a standing hint for resolving similar references in this session —
  don't repeat the same mistake.
