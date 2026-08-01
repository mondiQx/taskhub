import chokidar from "chokidar";
import { tasksDir } from "./taskFile.js";
import { taskRepository } from "./taskRepository.js";

/**
 * Watches vault/tasks/*.md for changes made outside this process — a hand
 * edit in the Obsidian app, or a file written by the sync-inbox skill.
 * Writes this process makes itself go through taskRepository directly, so
 * this only needs to reconcile; a brief self-write echo is harmless since
 * reconcileFile just re-parses and re-emits the same content.
 */
export function startVaultWatcher(): void {
  // chokidar v4 dropped glob-pattern support, so watch the directory itself
  // and filter to .md files in the event handlers instead.
  const watcher = chokidar.watch(tasksDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const isTaskFile = (filePath: string) => filePath.endsWith(".md");

  watcher.on("add", (filePath) => isTaskFile(filePath) && taskRepository.reconcileFile(filePath));
  watcher.on("change", (filePath) => isTaskFile(filePath) && taskRepository.reconcileFile(filePath));
  watcher.on("unlink", (filePath) => isTaskFile(filePath) && taskRepository.removeFile(filePath));
  watcher.on("error", (err) => console.error("[watcher] error:", err));
}
