import { taskRepository } from "../vault/taskRepository.js";
import { listVaultMeetingsFull } from "../vault/meetingsRepository.js";
import { broadcast } from "../api/ws.js";

const TICK_MS = 30_000;
const HEADS_UP_MS = 15 * 60_000;

/**
 * Every tick, checks tasks with a relatedMeeting whose start time has just
 * passed and whose reminder hasn't fired yet, then pushes a `meeting`
 * WS event (the frontend turns that into a browser Notification + sound)
 * and flips reminderFired on disk so it never fires twice.
 */
export function startReminderScheduler(): void {
  setInterval(tick, TICK_MS);
  setInterval(headsUpTick, TICK_MS);
}

async function tick(): Promise<void> {
  const now = Date.now();
  for (const task of taskRepository.list()) {
    const meeting = task.relatedMeeting;
    if (!meeting || meeting.reminderFired) continue;
    const startMs = Date.parse(meeting.start);
    if (Number.isNaN(startMs)) continue;
    // Fire once the meeting has started, but not for stale meetings we just missed by a lot on first boot.
    if (startMs <= now && now - startMs < TICK_MS * 4) {
      await taskRepository.update(task.id, {
        relatedMeeting: { ...meeting, reminderFired: true },
      });
      broadcast({
        channel: "meeting",
        payload: { taskId: task.id, title: meeting.title, note: task.body.slice(0, 200) },
      });
    }
  }
}

// Covers every cached meeting (not just ones with a linked task), firing a
// 15-minutes-out heads-up. In-memory only — a restart can re-fire a heads-up
// that already went out, which is a fine tradeoff for a single-user local
// tool (see CLAUDE.md) vs. persisting fired-state for every meeting file.
const headsUpFired = new Set<string>();

async function headsUpTick(): Promise<void> {
  const now = Date.now();
  for (const meeting of await listVaultMeetingsFull()) {
    const startMs = Date.parse(meeting.start);
    if (Number.isNaN(startMs)) continue;
    const msUntil = startMs - now;
    // Fire once we're within the 15-minute window, but not for meetings we
    // just missed the window on (a late tick, a server that was asleep).
    if (msUntil <= HEADS_UP_MS && msUntil > HEADS_UP_MS - TICK_MS * 4) {
      const key = `${meeting.id}:${meeting.start}`;
      if (headsUpFired.has(key)) continue;
      headsUpFired.add(key);
      broadcast({
        channel: "meeting",
        payload: { title: meeting.title, minutesUntil: 15 },
      });
    }
  }
}
