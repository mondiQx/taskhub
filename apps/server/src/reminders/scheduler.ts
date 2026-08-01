import { taskRepository } from "../vault/taskRepository.js";
import { broadcast } from "../api/ws.js";

const TICK_MS = 30_000;

/**
 * Every tick, checks tasks with a relatedMeeting whose start time has just
 * passed and whose reminder hasn't fired yet, then pushes a `meeting`
 * WS event (the frontend turns that into a browser Notification) and
 * flips reminderFired on disk so it never fires twice.
 */
export function startReminderScheduler(): void {
  setInterval(tick, TICK_MS);
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
