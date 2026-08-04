import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { config } from "../config.js";
import { taskRepository } from "./taskRepository.js";

export const inboxDir = path.join(config.vaultPath, "tasks", "_inbox");
const decisionsLogFile = path.join(inboxDir, "gmail-decisions-log.md");
const syncStateFile = path.join(config.dataPath, "sync-state.json");

export interface ReviewItem {
  id: string;
  subject: string;
  reason: string;
  threadId: string;
  from: string;
  sourceFile: string;
}

export type ReviewChangeEvent = { type: "removed" | "reset"; id?: string; items?: ReviewItem[] };

const LINE_RE = /^- \[([ x])\] (.+?) — (.+?) — thread:(\S+), from:(\S+)\s*$/;

function itemId(sourceFile: string, threadId: string): string {
  return `${path.basename(sourceFile)}::${threadId}`;
}

class ReviewQueueRepository extends EventEmitter {
  async list(): Promise<ReviewItem[]> {
    const items: ReviewItem[] = [];
    let entries: string[];
    try {
      entries = await fs.readdir(inboxDir);
    } catch {
      return items;
    }
    for (const entry of entries) {
      if (!/^gmail-review-.*\.md$/.test(entry)) continue;
      const sourceFile = path.join(inboxDir, entry);
      const raw = await fs.readFile(sourceFile, "utf8");
      for (const line of raw.split("\n")) {
        const match = LINE_RE.exec(line.trim());
        if (!match) continue;
        const [, checked, subject, reason, threadId, from] = match;
        if (checked === "x") continue; // already queued for promotion by the skill; hide from the live list
        items.push({ id: itemId(sourceFile, threadId), subject, reason, threadId, from, sourceFile });
      }
    }
    return items;
  }

  private async findItem(id: string): Promise<ReviewItem | undefined> {
    return (await this.list()).find((item) => item.id === id);
  }

  /** Records the accept/reject decision in .data/sync-state.json so /sync-gmail never re-queues this thread. */
  private async recordDecisionInState(threadId: string, decision: "create" | "declined"): Promise<void> {
    let state: any = {};
    try {
      state = JSON.parse(await fs.readFile(syncStateFile, "utf8"));
    } catch {
      // missing/corrupt state file — start fresh rather than blocking the decision
    }
    state.gmail ??= { lastRunAt: null, threads: {} };
    state.gmail.threads ??= {};
    state.gmail.threads[threadId] = { decision, at: new Date().toISOString() };
    await fs.mkdir(config.dataPath, { recursive: true });
    await fs.writeFile(syncStateFile, JSON.stringify(state, null, 2), "utf8");
  }

  /** Appends a permanent, human-readable record of the decision — this is what "going back to it" shows. */
  private async appendDecisionLog(item: ReviewItem, decision: "accepted" | "declined", note?: string): Promise<void> {
    const at = new Date().toISOString();
    const checkbox = decision === "accepted" ? "[x]" : "[ ]";
    const suffix = note ? `, ${note}` : "";
    const line = `- ${checkbox} ${item.subject} — ${decision}${suffix} — thread:${item.threadId}, from:${item.from} — ${at}\n`;
    let existing = "";
    try {
      existing = await fs.readFile(decisionsLogFile, "utf8");
    } catch {
      existing =
        "# Gmail review decisions log\n\n" +
        "Permanent record of every accept/reject decision made in the Review Queue view " +
        "(or by hand-editing/deleting a line in a `gmail-review-*.md` file). This file is " +
        "never re-parsed as a pending queue — it's history only.\n\n";
    }
    await fs.writeFile(decisionsLogFile, existing + line, "utf8");
  }

  private async removeLine(item: ReviewItem): Promise<void> {
    const raw = await fs.readFile(item.sourceFile, "utf8");
    const lines = raw.split("\n").filter((line) => {
      const match = LINE_RE.exec(line.trim());
      return !(match && match[4] === item.threadId);
    });
    const remainingItems = lines.some((line) => LINE_RE.test(line.trim()));
    if (remainingItems) {
      await fs.writeFile(item.sourceFile, lines.join("\n"), "utf8");
    } else {
      await fs.unlink(item.sourceFile);
    }
    this.emit("change", { type: "removed", id: item.id } satisfies ReviewChangeEvent);
  }

  /** Creates a bare-bones task from the queue line alone (no Gmail re-fetch) and drops the line. */
  async promote(id: string): Promise<void> {
    const item = await this.findItem(id);
    if (!item) throw new Error(`Review item ${id} not found`);
    const created = await taskRepository.create({
      title: item.subject,
      body: `${item.reason}\n\nFrom: ${item.from}`,
      priority: "medium",
      source: {
        type: "gmail",
        externalId: `thread:${item.threadId}`,
        url: `https://mail.google.com/mail/u/0/#inbox/${item.threadId}`,
      },
    });
    await this.removeLine(item);
    await this.recordDecisionInState(item.threadId, "create");
    await this.appendDecisionLog(item, "accepted", `created task ${created?.id ?? ""}`.trim());
  }

  async dismiss(id: string): Promise<void> {
    const item = await this.findItem(id);
    if (!item) throw new Error(`Review item ${id} not found`);
    await this.removeLine(item);
    await this.recordDecisionInState(item.threadId, "declined");
    await this.appendDecisionLog(item, "declined");
  }

  /** Called by the vault file watcher when an _inbox file changes outside this process (e.g. /sync-gmail writing new items). */
  async reconcile(): Promise<void> {
    this.emit("change", { type: "reset", items: await this.list() } satisfies ReviewChangeEvent);
  }
}

export const reviewQueueRepository = new ReviewQueueRepository();
