import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { EventEmitter } from "node:events";

// apps/server/src -> repo root is two levels up from process.cwd() (apps/server)
const repoRoot = path.resolve(process.cwd(), "../..");
const historyFile = path.resolve(repoRoot, ".data/journal-analysis-runs.json");
const MAX_HISTORY = 30;

export type JournalAnalysisStatus = "running" | "done" | "error" | "stopped";

export interface JournalAnalysisRun {
  id: string;
  date: string;
  status: JournalAnalysisStatus;
  startedAt: string;
  finishedAt: string | null;
  log: string[];
  error: string | null;
}

let history: JournalAnalysisRun[] = loadHistory();
let child: ChildProcessWithoutNullStreams | null = null;

export const journalAnalysisEvents = new EventEmitter();

function loadHistory(): JournalAnalysisRun[] {
  try {
    const runs = JSON.parse(fs.readFileSync(historyFile, "utf8")) as JournalAnalysisRun[];
    return runs.map((r) =>
      r.status === "running" ? { ...r, status: "error", error: "server restarted mid-run", finishedAt: r.startedAt } : r,
    );
  } catch {
    return [];
  }
}

function saveHistory() {
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(history.slice(0, MAX_HISTORY), null, 2));
}

export function getJournalAnalysisHistory(): JournalAnalysisRun[] {
  return history;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
}

function emitChange(run: JournalAnalysisRun) {
  saveHistory();
  journalAnalysisEvents.emit("change", run);
}

function buildAnalyzePrompt(date: string): string {
  return (
    `/journal Analyze the already-written journal entry for ${date} (vault/journal/${date}.md) for ` +
    "anything that hasn't yet been turned into a journal-review item — there is no new dictation to " +
    "append, just re-scan that entry's existing raw dump and propose review items (using the structured " +
    "<!--JR:{...}--> line format, written to vault/tasks/_inbox/journal-review-" +
    `${date}.md) for task updates, new tasks, meeting recaps, and bugs found in it that aren't already ` +
    "queued or already applied. Only analyze this one date's entry — don't touch other days. Also resolve " +
    "Step 0 (any existing checked review-queue lines for this date) first as usual."
  );
}

/**
 * Runs the /journal skill headlessly via the Claude Code CLI (same mechanism
 * as morningRun.ts's "Start my day") so the in-app "Analyze journal" button
 * doesn't require a live chat session — it spawns one on demand, scoped to
 * re-reading today's journal entry and writing journal-review-*.md items.
 * bypassPermissions is deliberate, same reasoning as morningRun.ts: unattended
 * automation on the user's own single-user machine, and /journal only ever
 * appends to the vault / proposes changes — never sends/posts externally.
 */
export function startJournalAnalysisRun(date: string): JournalAnalysisRun {
  if (history[0]?.status === "running") return history[0];

  const run: JournalAnalysisRun = {
    id: newId(),
    date,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    log: [],
    error: null,
  };
  history.unshift(run);
  history = history.slice(0, MAX_HISTORY);
  emitChange(run);

  child = spawn(
    "claude",
    ["-p", buildAnalyzePrompt(date), "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"],
    { cwd: repoRoot },
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
      for (const block of msg.message.content) {
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          run.log.push(block.text.trim());
        }
      }
      emitChange(run);
    }
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

  child.on("error", (err) => {
    run.status = "error";
    run.finishedAt = new Date().toISOString();
    run.error = err.message;
    child = null;
    emitChange(run);
  });

  child.on("close", (code) => {
    child = null;
    if (run.status === "stopped") return;
    if (code === 0) {
      run.status = "done";
    } else {
      run.status = "error";
      run.error = stderr.trim() || `exited with code ${code}`;
    }
    run.finishedAt = new Date().toISOString();
    emitChange(run);
  });

  return run;
}

export function stopJournalAnalysisRun(): JournalAnalysisRun | null {
  const run = history[0];
  if (!run || run.status !== "running" || !child) return run ?? null;
  child.kill("SIGTERM");
  child = null;
  run.status = "stopped";
  run.finishedAt = new Date().toISOString();
  run.log.push("— stopped by user —");
  emitChange(run);
  return run;
}
