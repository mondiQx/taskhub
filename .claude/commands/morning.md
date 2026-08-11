Run the full morning routine in order (later steps depend on the vault
state left by earlier ones):

1. `sync-gmail` skill — pull new/updated Gmail threads into `vault/tasks/`.
2. `sync-jira` skill — pull assigned Jira issues into `vault/tasks/`.
3. `sync-calendar` skill — refresh `vault/meetings/` and any prep/follow-up
   tasks, check recurring-meeting changes and HR holiday mail.
4. `sync-slack` skill — pull flagged/mentioned messages and awaiting-reply
   DMs into `vault/tasks/`.
5. `daily-briefing` skill — summarize what needs attention now that the
   vault is fresh.
6. `draft-followups` skill — prepare (never send) nudges for stalled
   Gmail/Jira tasks.

Do NOT hand the whole routine to a single opaque `personal-assistant`
agent call and just wait for it to finish — the `/morning` UI's run log
only captures the *top-level* assistant's own text output as it streams,
not anything a subagent says internally. If all steps are delegated in one
Agent/Task call, the log ends up with nothing but a launch message and a
terse closing paraphrase, and the real per-step results are effectively
lost even though the work happened.

Instead, either:
- run each skill directly yourself (invoking each via the Skill tool) and
  write your own summary text after each one completes, or
- if delegating a step to the `personal-assistant` agent, relay that
  agent's *actual* returned content back as your own assistant text
  (not a shortened paraphrase, not "see agent output above") before
  moving to the next step.

After each of the 6 steps, output a summary of what happened as your own
text — this is what streams into the run log in real time, so it must
stand on its own without pointing back at output the log never captured.
If any step's MCP connection isn't available (e.g. Slack not yet
authorized in a headless/cron run), report that plainly and continue with
the remaining steps rather than aborting the whole routine.
End with the full briefing text so it's the last thing the user reads.
