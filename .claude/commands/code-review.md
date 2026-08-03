Run the `code-review` skill against the current uncommitted diff (or a
branch/PR if the user names one): check it against this repo's own
conventions and CLAUDE.md rules (vault-as-source-of-truth, dedup
discipline, task schema completeness, single-user scope, sync-skill
read-only discipline). Report findings worst-first with file/line and
which rule each breaks, then a one-line verdict.
