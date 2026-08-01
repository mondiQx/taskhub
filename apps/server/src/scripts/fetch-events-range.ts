import { google } from "googleapis";
import { getAuthorizedGoogleClient } from "../auth/oauth-google.js";

/**
 * One-off historical lookup against the already-authorized Google Calendar
 * OAuth client (see auth/oauth-google.ts) — separate from
 * connectors/calendar.ts, which only ever polls a rolling 24h reminder
 * window. Prints matching events as JSON to stdout for a skill/script to
 * consume; never writes to the vault or the calendar itself.
 *
 * Usage: tsx src/scripts/fetch-events-range.ts --from 2026-01-01 --to 2026-08-01 [--q "search text"]
 */
async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const from = get("--from");
  const to = get("--to");
  const q = get("--q");
  if (!from || !to) {
    console.error("Usage: tsx src/scripts/fetch-events-range.ts --from YYYY-MM-DD --to YYYY-MM-DD [--q text]");
    process.exit(1);
  }

  const auth = await getAuthorizedGoogleClient();
  if (!auth) {
    console.error("Not authorized — run `npm run setup:google -w apps/server` first.");
    process.exit(1);
  }

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date(`${from}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${to}T23:59:59Z`).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    q,
    maxResults: 2500,
  });

  const events = (res.data.items ?? []).map((e) => ({
    id: e.id,
    title: e.summary ?? null,
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    attendees: (e.attendees ?? []).map((a) => a.email).filter(Boolean),
    description: e.description ?? null,
    htmlLink: e.htmlLink ?? null,
    recurringEventId: e.recurringEventId ?? null,
  }));

  console.log(JSON.stringify(events, null, 2));
}

main().catch((err) => {
  console.error("fetch-events-range failed:", err);
  process.exit(1);
});
