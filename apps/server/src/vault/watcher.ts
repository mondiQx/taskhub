import chokidar from "chokidar";
import { tasksDir } from "./taskFile.js";
import { taskRepository } from "./taskRepository.js";
import { inboxDir, reviewQueueRepository } from "./reviewQueue.js";
import { journalReviewRepository } from "./journalReview.js";

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

  const isTaskFile = (filePath: string) => filePath.endsWith(".md") && !filePath.startsWith(inboxDir);
  const isInboxFile = (filePath: string) => filePath.endsWith(".md") && filePath.startsWith(inboxDir);
  const isJournalReviewFile = (filePath: string) => /journal-review-.*\.md$/.test(filePath);

  watcher.on("add", (filePath) => {
    if (isTaskFile(filePath)) taskRepository.reconcileFile(filePath);
    else if (isJournalReviewFile(filePath)) journalReviewRepository.reconcile();
    else if (isInboxFile(filePath)) reviewQueueRepository.reconcile();
  });
  watcher.on("change", (filePath) => {
    if (isTaskFile(filePath)) taskRepository.reconcileFile(filePath);
    else if (isJournalReviewFile(filePath)) journalReviewRepository.reconcile();
    else if (isInboxFile(filePath)) reviewQueueRepository.reconcile();
  });
  watcher.on("unlink", (filePath) => {
    if (isTaskFile(filePath)) taskRepository.removeFile(filePath);
    else if (isJournalReviewFile(filePath)) journalReviewRepository.reconcile();
    else if (isInboxFile(filePath)) reviewQueueRepository.reconcile();
  });
  watcher.on("error", (err) => console.error("[watcher] error:", err));
}
