---
name: code-review
description: Review a working diff (or a PR) against this repo's own conventions and CLAUDE.md rules — vault-as-source-of-truth, dedup discipline, task schema completeness, single-user scope. Use when the user runs /code-review, asks for a review of pending changes, or asks whether a change is safe to commit/merge/deploy.
---

# code-review

A repo-specific pass, on top of whatever general code quality you'd
already apply — this skill exists because task-hub has a handful of rules
that are easy to violate without noticing, since nothing enforces them at
compile time (no schema validation on the vault, no auth layer, no tests).
Read `../../CLAUDE.md` first; every check below traces back to something
in it.

## Scope

Diff the target (uncommitted working tree by default; a specific branch/
PR if the user names one) against `main` (or `staging` if the user is
mid-deploy-review — ask if unclear which base makes sense). Don't review
files outside the diff — this isn't a full-repo audit (that's a different,
much bigger job; say so if the user actually wants that).

## Checks

**Vault integrity**
- Nothing adds a SQL/NoSQL dependency, an ORM, or any store for
  tasks/notes/meetings other than the markdown files under `vault/` — the
  vault is the database, full stop.
- Any new task-writing code path (a skill, a server route, a UI action)
  follows the dedup rule: check `source.externalId` before creating,
  update-in-place on a match. Flag any create path that doesn't check
  first.
- Every frontmatter timestamp a new/changed code path writes is a quoted
  string, not a bare YAML date — an unquoted `due: 2026-08-01T...` parses
  as a native Date and breaks anything calling `.localeCompare` on it
  (this has happened before, see `apps/server/src/vault/taskFile.ts`'s
  `stringifyDates`). Check both skill-authored files (SKILL.md
  instructions) and any server code that serializes frontmatter.
- `history` (frontmatter array) and the `## History` body section should
  stay in sync on every write that touches either — flag a diff that
  updates one without the other.

**Sync skill discipline** (sync-gmail/sync-jira/sync-calendar and similar)
- Read-only against the external source: no comment/transition/label/send
  call from a *sync* skill (that's what `draft-followups` is for, and even
  that only ever creates drafts, never sends). A sync skill calling
  anything that mutates Gmail/Jira/Calendar state is a bug.
- `draft-followups` specifically must never gain an auto-send/auto-post
  path without the user explicitly asking for it in writing — this is a
  deliberate safety boundary from CLAUDE.md, not an oversight to "fix".

**Single-user scope** (CLAUDE.md's "Do not" section)
- No multi-tenant scaffolding, user accounts, roles/permissions, or
  auth-hardening added to "future-proof" something — flag it even if it
  looks like solid engineering in isolation, since it's explicitly out of
  scope for a one-person local tool. Exception: the `deploy` skill's
  Tailscale-based access is the sanctioned exception; don't flag that.
- No paid API/service (transcription, push infra, hosted DB, etc.) wired
  in without the user having asked for it first.

**API/store wiring consistency**
- A new REST route in `router.ts` that needs a live-update counterpart
  should also get a WS channel in `ws.ts` (and a handler in
  `taskStore.ts`/the relevant Pinia store) — check for routes that only
  work on page load/refresh because the socket side was forgotten.
- A new Pinia store or view that reads `vault/<folder>/` should go through
  the existing repository/graph helpers (`taskRepository`,
  `meetingsRepository`, `graph.ts`) rather than re-implementing frontmatter
  parsing inline — flag duplicate `gray-matter` parsing logic.

**General**
- Build/typecheck actually run clean: `npx tsc --noEmit -p apps/server/tsconfig.json`
  and `npx vue-tsc --noEmit` (from `apps/web`) — don't take "it compiled
  when I last touched it" on faith for files in the current diff.
- No `.env`, `.credentials/`, `.data/`, or real vault content
  (`vault/tasks/*.md` etc., as opposed to the tracked `.gitkeep` files)
  staged for commit — these are gitignored for a reason (secrets,
  personal data); double-check a broad `git add` didn't sneak one in.
- Comments in new code explain *why*, not *what* — flag comments that just
  restate the following line, and flag missing comments where a genuinely
  non-obvious constraint or workaround has no explanation at all.

## Reporting

State findings as a plain list, worst first, each with the file/line and
*why* it's a problem (which rule above it breaks) — not a running
narration of the review process. If nothing's wrong, say so plainly rather
than manufacturing a nitpick to seem thorough. End with a one-line verdict:
safe to commit/merge/deploy as-is, or blocked on specific items.
