import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export const journalDir = path.join(config.vaultPath, "journal");

export interface JournalEntrySummary {
  date: string; // YYYY-MM-DD
  preview: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function stripHeadings(body: string): string {
  return body.replace(/^#{1,6}\s.*$/gm, "").replace(/[-*]\s*\*\*[\d:]+\*\*\s*—?\s*/g, "");
}

function previewOf(raw: string): string {
  const flat = stripHeadings(raw).replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
}

/** Lists all journal entries, most recent date first. */
export async function listJournalEntries(): Promise<JournalEntrySummary[]> {
  await fs.mkdir(journalDir, { recursive: true });
  const files = (await fs.readdir(journalDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  const entries = await Promise.all(
    files.map(async (f) => {
      const raw = await fs.readFile(path.join(journalDir, f), "utf8");
      return { date: f.replace(/\.md$/, ""), preview: previewOf(raw) };
    }),
  );
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function nowLabel(): string {
  return new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Inserts `line` as the first bullet directly under `## {heading}`, adding the heading (at the top of the file) if it isn't there yet. */
function insertUnderHeading(content: string, heading: string, line: string): string {
  const headingRe = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const match = headingRe.exec(content);
  if (!match) {
    const prefix = content.trim().length ? `## ${heading}\n${line}\n\n${content.trim()}\n` : `## ${heading}\n${line}\n`;
    return prefix;
  }
  const insertAt = match.index + match[0].length;
  return `${content.slice(0, insertAt)}\n${line}\n${content.slice(insertAt)}`;
}

/** Overwrites a journal file's full raw markdown body — used for hand-correcting a voice-dictated entry. */
export async function updateJournalEntryBody(date: string, body: string): Promise<JournalEntrySummary> {
  const filePath = path.join(journalDir, `${date}.md`);
  await fs.writeFile(filePath, body, "utf8");
  return { date, preview: previewOf(body) };
}

/**
 * Appends a captured entry to today's journal file, always verbatim and always first —
 * this is the ground-truth raw-dump record described in CLAUDE.md, independent of
 * whatever downstream extraction (the `journal` skill) later does with it.
 */
export async function appendJournalEntry(
  text: string,
  section: "Journal" | "Personal notes" = "Journal",
): Promise<JournalEntrySummary> {
  await fs.mkdir(journalDir, { recursive: true });
  const date = todayIso();
  const filePath = path.join(journalDir, `${date}.md`);
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    // no entry yet today
  }
  const line = `- **${nowLabel()}** — ${text.trim()}`;
  const updated = insertUnderHeading(content, section, line);
  await fs.writeFile(filePath, updated, "utf8");
  return { date, preview: previewOf(updated) };
}
