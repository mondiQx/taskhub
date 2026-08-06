import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { config } from "../config.js";
import { taskRepository } from "./taskRepository.js";
import { appendUnderHeadingInFile } from "./noteAppend.js";

export const journalInboxDir = path.join(config.vaultPath, "tasks", "_inbox");
const decisionsLogFile = path.join(journalInboxDir, "journal-decisions-log.md");

type NewTaskPayload = {
  kind: "new-task" | "bug";
  title: string;
  body: string;
  priority?: string;
  tags?: string[];
  due?: string;
};
type TaskUpdatePayload = { kind: "task-update"; taskId: string; patch: Record<string, unknown>; note?: string };
type MeetingRecapPayload = { kind: "meeting-recap"; targetPath: string; heading: string; text: string };
export type JournalReviewPayload = NewTaskPayload | TaskUpdatePayload | MeetingRecapPayload;

export interface JournalReviewItem {
  id: string;
  date: string;
  description: string;
  targetLabel: string;
  payload: JournalReviewPayload;
  sourceFile: string;
}

function dateOf(sourceFile: string): string {
  return /journal-review-(.+)\.md$/.exec(path.basename(sourceFile))?.[1] ?? "";
}

export type JournalReviewChangeEvent = { type: "removed" | "reset"; id?: string; items?: JournalReviewItem[] };

// `- [ ] <description> — target: <label> <!--JR:<json>-->`
const LINE_RE = /^- \[([ x])\] (.+?) — target: (.+?)\s*<!--JR:(.+?)-->\s*$/;

function itemId(sourceFile: string, index: number): string {
  return `${path.basename(sourceFile)}::${index}`;
}

class JournalReviewRepository extends EventEmitter {
  async list(): Promise<JournalReviewItem[]> {
    const items: JournalReviewItem[] = [];
    let entries: string[];
    try {
      entries = await fs.readdir(journalInboxDir);
    } catch {
      return items;
    }
    for (const entry of entries) {
      if (!/^journal-review-.*\.md$/.test(entry)) continue;
      const sourceFile = path.join(journalInboxDir, entry);
      const raw = await fs.readFile(sourceFile, "utf8");
      const lines = raw.split("\n");
      lines.forEach((line, index) => {
        const match = LINE_RE.exec(line.trim());
        if (!match) return;
        const [, checked, description, targetLabel, json] = match;
        if (checked === "x") return; // already promoted, hidden from the live list
        let payload: JournalReviewPayload;
        try {
          payload = JSON.parse(json);
        } catch {
          return; // malformed payload — not actionable in-app, skip rather than crash the list
        }
        items.push({ id: itemId(sourceFile, index), date: dateOf(sourceFile), description, targetLabel, payload, sourceFile });
      });
    }
    return items;
  }

  private async findItem(id: string): Promise<JournalReviewItem | undefined> {
    return (await this.list()).find((item) => item.id === id);
  }

  private async removeLine(item: JournalReviewItem): Promise<void> {
    const raw = await fs.readFile(item.sourceFile, "utf8");
    const index = Number(item.id.split("::").pop());
    const lines = raw.split("\n").filter((_, i) => i !== index);
    const remaining = lines.some((line) => LINE_RE.test(line.trim()));
    if (remaining) {
      await fs.writeFile(item.sourceFile, lines.join("\n"), "utf8");
    } else {
      await fs.unlink(item.sourceFile);
    }
    this.emit("change", { type: "removed", id: item.id } satisfies JournalReviewChangeEvent);
  }

  private async appendDecisionLog(item: JournalReviewItem, decision: "accepted" | "declined"): Promise<void> {
    const at = new Date().toISOString();
    const checkbox = decision === "accepted" ? "[x]" : "[ ]";
    const line = `- ${checkbox} ${item.description} — ${decision} — ${at}\n`;
    let existing = "";
    try {
      existing = await fs.readFile(decisionsLogFile, "utf8");
    } catch {
      existing =
        "# Journal review decisions log\n\n" +
        "Permanent record of every accept/reject decision made on a journal-review item " +
        "(in-app Journal confirm/reject queue, or the `/journal` skill promoting a checked line). " +
        "Never re-parsed as pending — history only.\n\n";
    }
    await fs.writeFile(decisionsLogFile, existing + line, "utf8");
  }

  /** Applies the recommendation to the vault, then drops the line. */
  async confirm(id: string): Promise<void> {
    const item = await this.findItem(id);
    if (!item) throw new Error(`Journal review item ${id} not found`);
    const { payload } = item;
    if (payload.kind === "new-task" || payload.kind === "bug") {
      await taskRepository.create({
        title: payload.title,
        body: payload.body,
        priority: (payload.priority as any) ?? "medium",
        tags: payload.tags ?? (payload.kind === "bug" ? ["bug"] : []),
        due: payload.due ?? undefined,
        source: { type: "manual", externalId: null, url: null },
      });
    } else if (payload.kind === "task-update") {
      await taskRepository.update(payload.taskId, payload.patch as any, {
        event: "updated",
        note: payload.note,
      });
    } else if (payload.kind === "meeting-recap") {
      const absPath = path.join(config.vaultPath, payload.targetPath.replace(/^vault\//, ""));
      await appendUnderHeadingInFile(absPath, payload.heading, payload.text);
    }
    await this.removeLine(item);
    await this.appendDecisionLog(item, "accepted");
  }

  async reject(id: string): Promise<void> {
    const item = await this.findItem(id);
    if (!item) throw new Error(`Journal review item ${id} not found`);
    await this.removeLine(item);
    await this.appendDecisionLog(item, "declined");
  }

  /** Called by the vault file watcher when an _inbox file changes outside this process. */
  async reconcile(): Promise<void> {
    this.emit("change", { type: "reset", items: await this.list() } satisfies JournalReviewChangeEvent);
  }
}

export const journalReviewRepository = new JournalReviewRepository();
