Run the full morning routine in order, reporting a short summary after
each step rather than waiting until the end:

1. `sync-gmail` skill — pull new/updated Gmail threads into `vault/tasks/`.
2. `sync-jira` skill — pull assigned Jira issues into `vault/tasks/`.
3. `sync-calendar` skill — refresh `vault/meetings/` and any prep/follow-up
   tasks, check recurring-meeting changes and HR holiday mail.
4. `daily-briefing` skill — summarize what needs attention now that the
   vault is fresh.
5. `draft-followups` skill — prepare (never send) nudges for stalled
   Gmail/Jira tasks.

If any step's MCP connection isn't available, report that plainly and
continue with the remaining steps rather than aborting the whole routine.
End with the full briefing text so it's the last thing the user reads.
