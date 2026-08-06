import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { Task } from "../types.js";

/**
 * A single entry from customizer-core's `knowledge/ticket-history.json`.
 * Read-only, best-effort — see field_descriptions in that file for the
 * canonical meanings. All fields are optional since triage data is often
 * partially filled in.
 */
export interface TicketHistoryEntry {
  key?: string;
  title?: string;
  rootCause?: string | null;
  fixType?: string | null;
  responsibleTeam?: string | null;
  confidence?: string | null;
}

/**
 * Looks up a Jira ticket key against customizer-core's ticket-history knowledge
 * file, if a local checkout is configured. Never throws — this is a live,
 * best-effort annotation, not a hard dependency. Returns null if
 * `customizerCorePath` isn't configured, the file is missing/malformed, or the
 * key isn't found.
 */
export async function lookupTicketHistory(ticketKey: string): Promise<TicketHistoryEntry | null> {
  if (!config.customizerCorePath) return null;
  try {
    const file = path.join(config.customizerCorePath, "knowledge", "ticket-history.json");
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [moduleName, entries] of Object.entries(parsed)) {
      if (moduleName === "_meta") continue;
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry && typeof entry === "object" && (entry as TicketHistoryEntry).key === ticketKey) {
          return entry as TicketHistoryEntry;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Attaches a read-time customizer-core ticket-history annotation to a jira-sourced task, if configured. */
export async function withTicketHistory(task: Task): Promise<Task> {
  if (task.source.type !== "jira" || !task.source.externalId) return task;
  const ticketHistory = await lookupTicketHistory(task.source.externalId);
  return { ...task, ticketHistory };
}
