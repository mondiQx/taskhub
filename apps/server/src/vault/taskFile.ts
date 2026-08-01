import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import type { HistoryEntry, NewTaskInput, Task } from "../types.js";

export const tasksDir = path.join(config.vaultPath, "tasks");

function historyToMarkdown(history: HistoryEntry[]): string {
  const lines = history.map((h) => {
    const date = h.at.slice(0, 10);
    const label = { created: "Created", reopened: "Reopened", completed: "Completed", updated: "Updated" }[h.event];
    return h.note ? `- ${date}: ${label} — ${h.note}.` : `- ${date}: ${label}.`;
  });
  return ["## History", ...lines].join("\n");
}

/** Rebuilds the markdown body so the auto-appended History section always matches frontmatter.history. */
function renderBody(freeformBody: string, history: HistoryEntry[]): string {
  const withoutHistorySection = freeformBody.replace(/\n?##\s*History[\s\S]*$/, "").trimEnd();
  return `${withoutHistorySection}\n\n${historyToMarkdown(history)}\n`;
}

export function taskToFileContents(task: Task): string {
  const { filePath: _filePath, body, ...frontmatter } = task;
  return matter.stringify(renderBody(body, task.history), frontmatter);
}

function stripHistorySection(body: string): string {
  return body.replace(/\n?##\s*History[\s\S]*$/, "").trimEnd();
}

export function parseTaskFile(filePath: string, raw: string): Task {
  const parsed = matter(raw);
  const fm = parsed.data as Omit<Task, "body" | "filePath">;
  return {
    ...fm,
    body: stripHistorySection(parsed.content.trim()),
    filePath,
  };
}

export async function readTaskFile(filePath: string): Promise<Task> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseTaskFile(filePath, raw);
}

export async function writeTaskFile(task: Task): Promise<void> {
  await fs.mkdir(path.dirname(task.filePath), { recursive: true });
  await fs.writeFile(task.filePath, taskToFileContents(task), "utf8");
}

export function newTaskFilePath(createdAt: string): string {
  const day = createdAt.slice(0, 10);
  return path.join(tasksDir, `${day}-${nanoid(6)}.md`);
}

export function buildNewTask(input: NewTaskInput): Task {
  const now = new Date().toISOString();
  return {
    id: nanoid(8),
    title: input.title,
    status: "open",
    priority: input.priority ?? "medium",
    created: now,
    due: input.due ?? null,
    completedAt: null,
    tags: input.tags ?? [],
    source: input.source ?? { type: "manual", externalId: null, url: null },
    relatedMeeting: input.relatedMeeting ?? null,
    history: [{ at: now, event: "created" }],
    body: input.body ?? "",
    filePath: newTaskFilePath(now),
  };
}
