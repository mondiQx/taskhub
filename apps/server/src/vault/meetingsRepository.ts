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
      // Prefer `start` (carries real time-of-day) over the date-only `date`
      // field, same reasoning as listVaultMeetingsFull below.
      const toIso = (v: unknown) => (typeof v === "string" ? v : v instanceof Date ? v.toISOString() : undefined);
      const start = toIso(fm.start) ?? toIso(fm.date);
      if (!start) return null;
      return { id: `vault:${id}`, title, start } satisfies CalendarEvent;
    }),
  );

  return meetings.filter((m): m is CalendarEvent => m !== null);
}

export interface VaultMeetingFull {
  id: string;
  title: string;
  start: string;
  end?: string;
  attendees?: string[];
  eventId?: string;
  recurringEventId?: string;
  hub?: string;
  source?: string;
  url?: string;
  recurs?: string;
}

function toIsoString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

/** Reads cached meeting notes from vault/meetings/ with full frontmatter, for the Meetings timeline view. */
export async function listVaultMeetingsFull(): Promise<VaultMeetingFull[]> {
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
      // Prefer `start` (carries real time-of-day) over the date-only `date`
      // field — most cached meetings set both, and falling back to `date`
      // first silently drops the time-of-day everywhere it's used.
      const start = toIsoString(fm.start) ?? toIsoString(fm.date);
      if (!start) return null;
      const meeting: VaultMeetingFull = { id, title, start };
      const end = toIsoString(fm.end);
      if (end) meeting.end = end;
      if (Array.isArray(fm.attendees)) meeting.attendees = fm.attendees as string[];
      if (typeof fm.eventId === "string") meeting.eventId = fm.eventId;
      if (typeof fm.recurringEventId === "string") meeting.recurringEventId = fm.recurringEventId;
      if (typeof fm.hub === "string") meeting.hub = fm.hub;
      if (typeof fm.source === "string") meeting.source = fm.source;
      if (typeof fm.url === "string") meeting.url = fm.url;
      if (typeof fm.recurs === "string") meeting.recurs = fm.recurs;
      return meeting;
    }),
  );

  return meetings.filter((m): m is VaultMeetingFull => m !== null);
}
