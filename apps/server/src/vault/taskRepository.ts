import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { buildNewTask, newTaskFilePath, readTaskFile, tasksDir, writeTaskFile } from "./taskFile.js";
import type { NewTaskInput, Task } from "../types.js";

export type TaskChangeEvent = { type: "added" | "updated" | "removed"; task?: Task; id?: string };

class TaskRepository extends EventEmitter {
  private tasks = new Map<string, Task>();
  private byFilePath = new Map<string, string>(); // filePath -> id

  async load(): Promise<void> {
    await fs.mkdir(tasksDir, { recursive: true });
    const entries = await fs.readdir(tasksDir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const filePath = `${tasksDir}/${entry}`;
      try {
        const task = await readTaskFile(filePath);
        this.tasks.set(task.id, task);
        this.byFilePath.set(filePath, task.id);
      } catch (err) {
        console.error(`[taskRepository] failed to parse ${filePath}:`, err);
      }
    }
  }

  list(): Task[] {
    return [...this.tasks.values()].sort((a, b) => a.created.localeCompare(b.created));
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  findBySourceExternalId(sourceType: string, externalId: string): Task | undefined {
    return this.list().find((t) => t.source.type === sourceType && t.source.externalId === externalId);
  }

  async create(input: NewTaskInput): Promise<Task> {
    const task = buildNewTask(input);
    await writeTaskFile(task);
    this.tasks.set(task.id, task);
    this.byFilePath.set(task.filePath, task.id);
    this.emit("change", { type: "added", task } satisfies TaskChangeEvent);
    return task;
  }

  async update(id: string, patch: Partial<Task>, historyEvent?: { event: "reopened" | "completed" | "updated"; note?: string }): Promise<Task> {
    const existing = this.tasks.get(id);
    if (!existing) throw new Error(`Task ${id} not found`);
    const now = new Date().toISOString();
    // js-yaml can't serialize an explicit `note: undefined` key, so only include it when set.
    const entry = historyEvent && {
      at: now,
      event: historyEvent.event,
      ...(historyEvent.note ? { note: historyEvent.note } : {}),
    };
    const history = entry ? [...existing.history, entry] : existing.history;
    const updated: Task = { ...existing, ...patch, history };
    await writeTaskFile(updated);
    this.tasks.set(id, updated);
    this.emit("change", { type: "updated", task: updated } satisfies TaskChangeEvent);
    return updated;
  }

  async complete(id: string): Promise<Task> {
    const now = new Date().toISOString();
    return this.update(id, { status: "done", completedAt: now }, { event: "completed" });
  }

  async reopen(id: string, note?: string): Promise<Task> {
    return this.update(id, { status: "open", completedAt: null }, { event: "reopened", note });
  }

  /** Marks a task as opened/read — deliberately no historyEvent, so glancing at a task doesn't spam its edit history. */
  async markSeen(id: string): Promise<Task> {
    const existing = this.tasks.get(id);
    if (!existing) throw new Error(`Task ${id} not found`);
    if (existing.seenAt !== null) return existing; // already seen — no-op, avoids a redundant file write
    return this.update(id, { seenAt: new Date().toISOString() });
  }

  async delete(id: string): Promise<void> {
    const existing = this.tasks.get(id);
    if (!existing) throw new Error(`Task ${id} not found`);
    await fs.unlink(existing.filePath);
    this.tasks.delete(id);
    this.byFilePath.delete(existing.filePath);
    this.emit("change", { type: "removed", id } satisfies TaskChangeEvent);
  }

  /** Reconciles an externally-changed file (edited in Obsidian, or written by the sync-inbox skill). */
  async reconcileFile(filePath: string): Promise<void> {
    try {
      const task = await readTaskFile(filePath);
      const isNew = !this.byFilePath.has(filePath);
      this.tasks.set(task.id, task);
      this.byFilePath.set(filePath, task.id);
      this.emit("change", { type: isNew ? "added" : "updated", task } satisfies TaskChangeEvent);
    } catch (err) {
      console.error(`[taskRepository] failed to reconcile ${filePath}:`, err);
    }
  }

  removeFile(filePath: string): void {
    const id = this.byFilePath.get(filePath);
    if (!id) return;
    this.tasks.delete(id);
    this.byFilePath.delete(filePath);
    this.emit("change", { type: "removed", id } satisfies TaskChangeEvent);
  }

  /** True right after this process wrote filePath itself, so the watcher can skip re-emitting a duplicate event. */
  ownsFile(filePath: string): boolean {
    return this.byFilePath.has(filePath);
  }
}

export const taskRepository = new TaskRepository();
export { newTaskFilePath };
