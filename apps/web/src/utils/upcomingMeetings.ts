import type { Meeting } from "../types";

export interface SeriesGroup {
  key: string;
  latest: Meeting;
  occurrences: Meeting[];
}

export interface UpcomingItem {
  id: string;
  /** Unique per row for v-for :key — for a recurring series' expanded
   * occurrences this differs per date, while `id` stays the cache file's
   * real id (needed to open the actual note instead of a synthetic one). */
  key: string;
  title: string;
  start: string;
  relative: string;
  recurring: boolean;
  eventId?: string;
}

export function normalizedTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function daysUntil(iso: string): number {
  const now = new Date();
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(iso);
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((startOfTarget - startOfNow) / 86_400_000);
}

const HAS_TIME_OF_DAY = /T\d{2}:\d{2}/;

export function relativeLabel(iso: string): string {
  const days = daysUntil(iso);
  const day = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  if (!HAS_TIME_OF_DAY.test(iso)) return day; // all-day event — no time-of-day to show
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

// Recurring series' recurringEventId can regenerate (e.g. when the series is
// re-created in Google Calendar), so group by title within the recurring
// bucket — otherwise the same meeting fragments into multiple rows.
export function computeRecurringSeries(meetings: Meeting[]): SeriesGroup[] {
  const bySeries = new Map<string, Meeting[]>();
  for (const m of meetings) {
    if (!m.recurringEventId) continue;
    const key = `title:${normalizedTitle(m.title)}`;
    const list = bySeries.get(key) ?? [];
    list.push(m);
    bySeries.set(key, list);
  }

  return Array.from(bySeries.entries())
    .map(([key, occurrences]) => {
      const sorted = [...occurrences].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
      return { key, latest: sorted[0], occurrences: sorted };
    })
    .sort((a, b) => new Date(b.latest.start).getTime() - new Date(a.latest.start).getTime());
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Parses the plain-English `recurs` field (see sync-calendar's SKILL.md) into
// a steppable cadence. Only handles the shapes that skill actually produces —
// not a general RRULE parser.
type Cadence = { kind: "weekday" } | { kind: "days"; n: number } | { kind: "weekdays"; days: number[] };

const WEEKDAY_ABBREVS: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function parseCadence(recurs: string | undefined): Cadence | null {
  if (!recurs) return null;
  const text = recurs.toLowerCase();
  if (text.includes("every weekday")) return { kind: "weekday" };
  // e.g. "Mon/Wed/Fri, 11:00 AM..." — a fixed weekly set of days, not every weekday.
  const abbrevPattern = Object.keys(WEEKDAY_ABBREVS).join("|");
  const listMatch = text.match(new RegExp(`\\b(?:${abbrevPattern})(?:\\/(?:${abbrevPattern}))+\\b`));
  if (listMatch) {
    const days = listMatch[0].split("/").map((d) => WEEKDAY_ABBREVS[d]);
    return { kind: "weekdays", days };
  }
  for (const day of WEEKDAY_NAMES) {
    if (text.includes(`every ${day}`)) return { kind: "days", n: 7 };
  }
  if (/every\s+2\s+weeks/.test(text)) return { kind: "days", n: 14 };
  if (text.includes("quarterly") || text.includes("3 months") || text.includes("13 weeks")) {
    return { kind: "days", n: 91 };
  }
  if (text.includes("every month")) return { kind: "days", n: 30 };
  return null;
}

// Only steps forward if the anchor occurrence has already passed — a
// still-upcoming anchor (e.g. today's own occurrence) must be returned
// as-is, not skipped to the next one, so "today" doesn't get reported as
// "tomorrow" for meetings later that same day.
function stepToFuture(anchorIso: string, cadence: Cadence): string {
  const next = new Date(anchorIso);
  const now = Date.now();
  let guard = 0;
  if (cadence.kind === "weekday") {
    while ((next.getTime() < now || next.getDay() === 0 || next.getDay() === 6) && guard < 1000) {
      next.setDate(next.getDate() + 1);
      guard++;
    }
  } else if (cadence.kind === "weekdays") {
    while ((next.getTime() < now || !cadence.days.includes(next.getDay())) && guard < 1000) {
      next.setDate(next.getDate() + 1);
      guard++;
    }
  } else {
    while (next.getTime() < now && guard < 1000) {
      next.setDate(next.getDate() + cadence.n);
      guard++;
    }
  }
  return next.toISOString();
}

// A recurring series' cache file only ever holds its most recent *past*
// occurrence — sync-calendar samples history, it doesn't pre-write future
// instances. So "is there a recurring meeting coming up" has to be projected:
// prefer the gap between the two latest known occurrences as the observed
// cadence, falling back to the plain-English `recurs` field when only one
// occurrence is cached (the common case).
export function projectNextOccurrence(sg: SeriesGroup): string | null {
  if (sg.occurrences.length >= 2) {
    const latest = new Date(sg.occurrences[0].start).getTime();
    const prev = new Date(sg.occurrences[1].start).getTime();
    const interval = latest - prev;
    if (interval > 0) {
      const now = Date.now();
      let next = latest;
      let guard = 0;
      while (next <= now && guard < 1000) {
        next += interval;
        guard++;
      }
      return new Date(next).toISOString();
    }
  }

  const cadence = parseCadence(sg.latest.recurs);
  if (!cadence) return null;
  return stepToFuture(sg.latest.start, cadence);
}

// A "weekdays" cadence (e.g. Mon/Wed/Fri) covers several distinct upcoming
// dates, not just one — so unlike the observed-interval fallback, project
// every matching date through the lookahead window instead of stopping at
// the first.
function projectOccurrences(sg: SeriesGroup, lookaheadDays: number): string[] {
  const cadence = parseCadence(sg.latest.recurs);
  if (!cadence || cadence.kind === "days") {
    // No cadence to project from (missing/unparseable `recurs`, only one
    // cached occurrence) — if that lone occurrence hasn't happened yet, it's
    // still a real upcoming meeting, so surface it as-is rather than
    // dropping the whole series.
    const next =
      sg.occurrences.length >= 2
        ? projectNextOccurrence(sg)
        : cadence
          ? stepToFuture(sg.latest.start, cadence)
          : new Date(sg.latest.start).getTime() >= Date.now()
            ? sg.latest.start
            : null;
    return next && daysUntil(next) <= lookaheadDays ? [next] : [];
  }

  const results: string[] = [];
  let anchor = stepToFuture(sg.latest.start, cadence);
  let guard = 0;
  while (daysUntil(anchor) <= lookaheadDays && guard < 200) {
    results.push(anchor);
    guard++;
    const nextDay = new Date(anchor);
    nextDay.setDate(nextDay.getDate() + 1);
    anchor = stepToFuture(nextDay.toISOString(), cadence);
  }
  return results;
}

// GCal instance ids follow `<recurringEventId>_<UTCstart as YYYYMMDDTHHMMSSZ>`
// (see the cached meeting files under vault/meetings/) — reconstruct that
// per-occurrence id so a task's relatedMeeting.eventId can target one specific
// date in the series (e.g. "this Wednesday's" session) rather than matching
// every occurrence.
function datedEventId(recurringEventId: string, iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  return `${recurringEventId}_${stamp}`;
}

// Only surface projected recurring occurrences that land within
// `lookaheadDays` — otherwise a discontinued series would show up as
// perpetually "upcoming".
export function computeUpcomingItems(meetings: Meeting[], lookaheadDays: number): UpcomingItem[] {
  const now = Date.now();
  const items: UpcomingItem[] = [];

  for (const m of meetings) {
    if (m.recurringEventId) continue; // recurring handled via projection below
    if (new Date(m.start).getTime() < now) continue;
    if (daysUntil(m.start) > lookaheadDays) continue;
    items.push({
      id: m.id,
      key: m.id,
      title: m.title,
      start: m.start,
      relative: relativeLabel(m.start),
      recurring: false,
      eventId: m.eventId,
    });
  }

  for (const sg of computeRecurringSeries(meetings)) {
    for (const occStart of projectOccurrences(sg, lookaheadDays)) {
      items.push({
        id: sg.latest.id,
        key: `${sg.key}:${occStart}`,
        title: sg.latest.title,
        start: occStart,
        relative: relativeLabel(occStart),
        recurring: true,
        eventId: sg.latest.recurringEventId ? datedEventId(sg.latest.recurringEventId, occStart) : undefined,
      });
    }
  }

  // Numeric comparison, not string: cached one-off meetings keep their
  // original "+08:00" offset while projected recurring occurrences come out
  // of stepToFuture()'s toISOString() as UTC "Z" — comparing those two
  // formats lexicographically scrambles same-day ordering (e.g. a 10am
  // "+08:00" meeting sorting before an 8am one projected as "Z").
  return items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}
