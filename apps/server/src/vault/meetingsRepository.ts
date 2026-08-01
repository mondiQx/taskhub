import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { config } from "../config.js";
import type { CalendarEvent } from "../reminders/calendarCache.js";

const MEETINGS_DIR = path.join(config.vaultPath, "meetings");

/** Reads cached meeting notes from vault/meetings/ for use as relatedMeeting link targets. */
export async function listVaultMeetings(): Promise<CalendarEvent[]> {
  let entries: string[];
  try {
    entries = (await fs.readdir(MEETINGS_DIR)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const meetings = await Promise.all(
    entries.map(async (filename) => {
      const raw = await fs.readFile(path.join(MEETINGS_DIR, filename), "utf-8");
      const fm = matter(raw).data as Record<string, unknown>;
      const id = filename.replace(/\.md$/, "");
      const title = typeof fm.title === "string" ? fm.title : id;
      const rawDate = fm.date;
      const start =
        typeof rawDate === "string" ? rawDate : rawDate instanceof Date ? rawDate.toISOString() : undefined;
      if (!start) return null;
      return { id: `vault:${id}`, title, start } satisfies CalendarEvent;
    }),
  );

  return meetings.filter((m): m is CalendarEvent => m !== null);
}
