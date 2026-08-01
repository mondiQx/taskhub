Run the `sync-jira` skill to pull Jira issues assigned to the user into
`vault/tasks/`, following the dedup rule and completeness rule in the
skill. One-way sync only — never write back to Jira. Report a short
summary of what was created vs. updated vs. skipped.
