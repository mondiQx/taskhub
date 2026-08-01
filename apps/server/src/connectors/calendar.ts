import { google } from "googleapis";
import { getAuthorizedGoogleClient } from "../auth/oauth-google.js";
import { calendarCache, type CalendarEvent } from "../reminders/calendarCache.js";

const REFRESH_MS = 2 * 60_000;
const WINDOW_MS = 24 * 60 * 60_000;

/**
 * Refreshes the in-memory calendar cache from the free-tier Google Calendar
 * API. Calendar events are reference data (not tasks) unless a task links
 * to one via relatedMeeting — so this never touches vault/tasks/ directly.
 */
export async function startCalendarPolling(): Promise<void> {
  const auth = await getAuthorizedGoogleClient();
  if (!auth) {
    console.log("[calendar] not authorized yet — run `npm run setup:google -w apps/server` to enable meeting reminders.");
    return;
  }

  const refresh = async () => {
    try {
      const events = await fetchUpcomingEvents(auth);
      calendarCache.set(events);
    } catch (err) {
      console.error("[calendar] failed to refresh events:", err);
    }
  };

  await refresh();
  setInterval(refresh, REFRESH_MS);
}

async function fetchUpcomingEvents(auth: Awaited<ReturnType<typeof getAuthorizedGoogleClient>>): Promise<CalendarEvent[]> {
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + WINDOW_MS).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items ?? [])
    .filter((event) => event.id && event.summary && event.start?.dateTime)
    .map((event) => ({
      id: `gcal:${event.id}`,
      title: event.summary!,
      start: event.start!.dateTime!,
    }));
}
