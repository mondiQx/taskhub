import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { EventEmitter } from "node:events";

// apps/server/src -> repo root is two levels up from process.cwd() (apps/server)
const repoRoot = path.resolve(process.cwd(), "../..");
const historyFile = path.resolve(repoRoot, ".data/morning-runs.json");
const MAX_HISTORY = 30;

export type MorningStatus = "running" | "done" | "error" | "stopped";

export interface MorningRun {
  id: string;
  status: MorningStatus;
  startedAt: string;
  finishedAt: string | null;
  log: string[];
  activity: string | null;
  error: string | null;
}

let history: MorningRun[] = loadHistory();
let child: ChildProcessWithoutNullStreams | null = null;

export const morningEvents = new EventEmitter();

function loadHistory(): MorningRun[] {
  try {
    const runs = JSON.parse(fs.readFileSync(historyFile, "utf8")) as MorningRun[];
    // A run stuck "running" across a server restart lost its child process — mark it dead.
    return runs.map((r) =>
      r.status === "running"
        ? { ...r, status: "error", error: "server restarted mid-run", finishedAt: r.startedAt, activity: null }
        : r
    );
  } catch {
    return [];
  }
}

function saveHistory() {
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(history.slice(0, MAX_HISTORY), null, 2));
}

export function getHistory(): MorningRun[] {
  return history;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
}

function emitChange(run: MorningRun) {
  saveHistory();
  morningEvents.emit("change", run);
}

/**
 * Runs the /morning routine headlessly via the Claude Code CLI, reusing
 * this machine's already-authorized Gmail/Atlassian/Calendar MCP
 * connections — same mechanism as the LaunchAgent in scripts/, just
 * triggered on demand from the UI instead of a schedule. Uses
 * --output-format stream-json so each step's narration streams into the
 * run's log as it happens, instead of waiting for the whole routine to
 * finish.
 *
 * bypassPermissions is deliberate: this is unattended automation on the
 * user's own single-user machine (see CLAUDE.md — "one person, one Mac"),
 * and the skills it runs are scoped to only touch vault/ and create drafts,
 * never send/post (see draft-followups skill).
 */
export function startMorningRun(): MorningRun {
  if (history[0]?.status === "running") return history[0];

  const run: MorningRun = {
    id: newId(),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    log: [],
    activity: null,
    error: null,
  };
  history.unshift(run);
  history = history.slice(0, MAX_HISTORY);
  emitChange(run);

  child = spawn(
    "claude",
    ["-p", "/morning", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"],
    { cwd: repoRoot }
  );

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
      let changed = false;
      for (const block of msg.message.content) {
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          run.log.push(block.text.trim());
          run.activity = null;
          changed = true;
        } else if (block.type === "tool_use" && typeof block.name === "string") {
          run.activity = `Running ${block.name}...`;
          changed = true;
        }
      }
      if (changed) emitChange(run);
    } else if (msg.type === "user" && Array.isArray(msg.message?.content)) {
      // A tool_result means the in-flight tool call finished — clear the
      // transient "Running X..." indicator so it never lingers in the
      // permanent log; the next text block (if any) will replace it.
      if (msg.message.content.some((block: any) => block.type === "tool_result")) {
        run.activity = null;
        emitChange(run);
      }
    } else if (msg.type === "result") {
      run.activity = null;
      emitChange(run);
    }
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

  child.on("error", (err) => {
    run.status = "error";
    run.finishedAt = new Date().toISOString();
    run.activity = null;
    run.error = err.message;
    child = null;
    emitChange(run);
  });

  child.on("close", (code) => {
    child = null;
    if (run.status === "stopped") return; // already finalized by stopMorningRun
    if (code === 0) {
      run.status = "done";
    } else {
      run.status = "error";
      run.error = stderr.trim() || `exited with code ${code}`;
    }
    run.finishedAt = new Date().toISOString();
    run.activity = null;
    emitChange(run);
  });

  return run;
}

export function stopMorningRun(): MorningRun | null {
  const run = history[0];
  if (!run || run.status !== "running" || !child) return run ?? null;
  child.kill("SIGTERM");
  child = null;
  run.status = "stopped";
  run.finishedAt = new Date().toISOString();
  run.activity = null;
  run.log.push("— stopped by user —");
  emitChange(run);
  return run;
}
