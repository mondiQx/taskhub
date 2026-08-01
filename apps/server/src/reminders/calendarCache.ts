export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
}

/** In-memory cache of upcoming events, refreshed by connectors/calendar.ts. */
class CalendarCache {
  private events: CalendarEvent[] = [];

  set(events: CalendarEvent[]): void {
    this.events = events;
  }

  list(): CalendarEvent[] {
    return this.events;
  }

  get(eventId: string): CalendarEvent | undefined {
    return this.events.find((e) => e.id === eventId);
  }
}

export const calendarCache = new CalendarCache();
