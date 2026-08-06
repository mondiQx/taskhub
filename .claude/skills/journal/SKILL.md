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

Most of the time this is now handled without a session at all: the web
app's Journal view reads `journal-review-*.md` directly and has its own
Confirm/Reject buttons (backed by `POST /api/journal-review/:id/confirm`
and `/reject`), which apply or drop a line immediately — no need to wait
for the next `/journal` run. Every in-app decision is logged permanently
to `vault/tasks/_inbox/journal-decisions-log.md`.

Still, before processing new input in *this* skill, check for an
unresolved `vault/tasks/_inbox/journal-review-<today>.md` (or an earlier
date's file still present) in case anything is left over from hand-editing
the file directly. For every line checked `[x]`, apply the proposed
change exactly as written on that line (edit the referenced task/meeting
file), then remove the line. Leave every `[ ]` line in place — the user
hasn't decided yet. If the file ends up empty, delete it.

Report how many were promoted from the queue before moving on.

## Step 1 — write the raw dump verbatim, always, first

Append the user's input, unedited, to `vault/journal/<today>.md` under a
`## Journal` heading (create the file if it doesn't exist). This happens
unconditionally, before any interpretation — it's the ground truth record,
independent of whatever gets extracted or how well the extraction goes.

Exception: entries dictated through the web app's mic button are run through
a wording/grammar cleanup pass (`POST /api/journal/clean-transcript`, backed
by a headless `claude -p` call — see `apps/server/src/automation/
voiceCleanup.ts`) before being written, since raw ASR output for a non-native
speaker is often unusable verbatim. Only text the mic captured untouched by
further typing goes through this; anything hand-typed (in this skill's flow,
or edited after dictation in the app) is still written exactly as given.

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
tickets", "the IDV meeting") in this order:

1. **Graph backlinks first.** `curl -s http://localhost:4173/api/graph` (or
   `:4174` if only the dev server is up) returns every vault file as a node
   plus every `[[wikilink]]` as an edge. Filter nodes by label/id for the
   topic, then follow edges to see what's actually *linked* to it — this
   catches the right file even when the journal's wording doesn't share
   vocabulary with the target file's title (e.g. "the leaderboard meeting"
   resolving to a file titled "Leaderboard with IDV" via its edges to
   [[analytics-idv-updates]], rather than a title-text match).
2. **Fuzzy vault search next** — `GET http://localhost:4173/api/vault/search?q=<terms>`
   (or `:4174` for dev) runs a local, fully offline lexical search (MiniSearch;
   no embeddings, no network calls, nothing billed) over every task/note/
   meeting/journal file's title+tags+body, with typo and prefix tolerance.
   This is what catches a misspelling in the journal text itself (e.g.
   "barnd" for "brand") or a query where the wording doesn't share exact
   vocabulary with the target's title — try a couple of phrasings of the
   reference if the first query comes back thin.

   **This is keyword overlap, not semantic understanding — it does not
   know who anyone is.** If a first name matches more than one person's
   note (e.g. two people named Cris), a bare `q=cris` search ranks them by
   superficial title-string closeness, not by which one the journal
   actually means. Always fold in whatever topic words surround the name
   in the journal sentence (`q=cris AI assistant workforce`, not just
   `q=cris`) — real term overlap with the *right* person's note content is
   what actually disambiguates, and it only works if those words are in
   the query. Even then, if two people's notes happen to share vocabulary,
   this can still rank the wrong one — treat a same-first-name collision
   as **genuine ambiguity** (see the exception below) and queue it rather
   than trusting the top search hit.
3. **Tag glossary**, when the reference names a person or project: check
   `vault/notes/tag-glossary.md` for the canonical tag spelling before
   grepping — a typo'd or divergent tag (`chris-dismaya` vs. the canonical
   `cris-dismaya`, `reggienel-patawaran` vs. the note id
   `reggie-patawaran`) won't turn up in a plain grep for the canonical
   form, and vice versa. If a task/note is tagged with something clearly
   near a glossary entry, treat it as the same tag rather than missing
   the match — and fix the drifted tag while you're there.
4. **Raw grep as the last resort** — search titles/tags/content in
   `vault/tasks/` and `vault/meetings/` directly, same as before, for
   whatever the graph, fuzzy search, and glossary didn't resolve.

Whichever step resolves it, the goal is the same: name the *actual*
target file concretely (Step 3 below) so a wrong match is obvious at a
glance, not "the SRE task" or "the IDV meeting" left vague.

## Step 3 — propose, don't apply

For every candidate item, write one line to
`vault/tasks/_inbox/journal-review-<today>.md` (create it if it doesn't
exist, with a one-line header explaining it's pending confirmation):

```
- [ ] <plain-language description of the proposed change> — target: <human-readable target> <!--JR:<json>-->
```

The human-readable part (description + target) is for a person reading
the raw file in Obsidian. The trailing `<!--JR:{...}-->` HTML comment
(invisible in Obsidian's preview) is what makes the item *actionable
in-app* — the web app's Journal view reads it to render a Confirm/Reject
row and knows exactly what to do when confirmed. Always include it; a
line without a valid JR comment is silently skipped by the app (still
visible to a human, but no in-app button). The JSON payload shape
depends on the candidate kind:

- **New task / bug**: `{"kind":"new-task","title":"...","body":"...","priority":"medium","tags":["..."]}`
  (use `"kind":"bug"` for app-bug observations instead of `"new-task"`)
- **Task field update**: `{"kind":"task-update","taskId":"<task id from its frontmatter>","patch":{...fields...},"note":"..."}`
  — `patch` is merged onto the task's frontmatter fields (e.g. `{"body":"<full new body text, already merged>"}` to
  append content, or `{"priority":"high"}` for a field change); `note` becomes the history entry's note.
- **Meeting recap**: `{"kind":"meeting-recap","targetPath":"vault/meetings/<file>.md","heading":"Journal recap — <today>","text":"..."}`
  — `text` is appended as a bullet/paragraph under `## <heading>` in the
  meeting note's body (frontmatter untouched).

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
