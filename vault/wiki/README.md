---
title: task-hub wiki
---

# task-hub wiki

Internal documentation for the task-hub codebase itself — not a task, note,
or meeting. Deliberately kept out of the Obsidian graph: nothing in here
uses `[[wikilinks]]` to other vault content, and nothing else in the vault
should link into these pages. If you're looking for Raymond's actual
tasks/notes/meetings, this isn't it — see `vault/tasks/`, `vault/notes/`,
`vault/meetings/` instead.

Purpose: faster triage of feature requests/bugs against this repo, without
re-exploring the codebase (or spawning an investigator agent) every time.

## Pages

- [Architecture](architecture.md) — repo layout, how the vault/backend/
  frontend/skills fit together, data flow.
- [API reference](api-reference.md) — every backend HTTP route + WebSocket
  message type.
- [Frontend](frontend.md) — Vue views, Pinia stores, composables, how
  navigation works (no vue-router).
- [Skills](skills.md) — what each `.claude/skills/` folder does.
- [Dev workflow](dev-workflow.md) — running locally, building, deploying to
  the phone over Tailscale.

For the task/note/meeting schema and folder conventions, see the root
[`CLAUDE.md`](../../CLAUDE.md) — that stays the canonical reference; these
wiki pages document the *code*, not the vault schema, to avoid drift
between two copies of the same rules.
