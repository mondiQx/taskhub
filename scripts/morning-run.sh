#!/bin/zsh
# Runs the /morning routine headlessly against this repo. Invoked by the
# com.raymond.task-hub.morning LaunchAgent — see .claude/ONBOARDING or
# README for setup. Logs go to ~/Library/Logs/task-hub-morning.log.
cd "$(dirname "$0")/.."
/opt/homebrew/bin/claude -p "/morning" --allowedTools "*" >> ~/Library/Logs/task-hub-morning.log 2>&1
