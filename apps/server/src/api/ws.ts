import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { taskRepository, type TaskChangeEvent } from "../vault/taskRepository.js";
import { withTicketHistory } from "../vault/ticketBridge.js";
import { getHistory, morningEvents, type MorningRun } from "../automation/morningRun.js";
import { getJournalAnalysisHistory, journalAnalysisEvents, type JournalAnalysisRun } from "../automation/journalAnalysisRun.js";
import { reviewQueueRepository, type ReviewChangeEvent, type ReviewItem } from "../vault/reviewQueue.js";
import { journalReviewRepository, type JournalReviewChangeEvent, type JournalReviewItem } from "../vault/journalReview.js";

export type ServerEvent =
  | { channel: "task"; payload: TaskChangeEvent }
  | { channel: "snapshot"; payload: { tasks: ReturnType<typeof taskRepository.list> } }
  | { channel: "meeting"; payload: { taskId: string; title: string; note: string } }
  | { channel: "meeting"; payload: { title: string; minutesUntil: number } }
  | { channel: "morning"; payload: MorningRun }
  | { channel: "journal-analysis"; payload: JournalAnalysisRun }
  | { channel: "review"; payload: ReviewChangeEvent }
  | { channel: "review-snapshot"; payload: { items: ReviewItem[] } }
  | { channel: "journal-review"; payload: JournalReviewChangeEvent }
  | { channel: "journal-review-snapshot"; payload: { items: JournalReviewItem[] } };

let wss: WebSocketServer | undefined;

/** Annotates a task-change event's `task` payload (add/update cases) with ticketHistory before broadcasting. */
async function annotateChangeEvent(event: TaskChangeEvent): Promise<TaskChangeEvent> {
  if (!event.task) return event;
  return { ...event, task: await withTicketHistory(event.task) };
}

export function startWebSocketServer(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  taskRepository.on("change", (event: TaskChangeEvent) => {
    void annotateChangeEvent(event).then((annotated) => broadcast({ channel: "task", payload: annotated }));
  });

  morningEvents.on("change", (run: MorningRun) => {
    broadcast({ channel: "morning", payload: run });
  });

  journalAnalysisEvents.on("change", (run: JournalAnalysisRun) => {
    broadcast({ channel: "journal-analysis", payload: run });
  });

  reviewQueueRepository.on("change", (event: ReviewChangeEvent) => {
    broadcast({ channel: "review", payload: event });
  });

  journalReviewRepository.on("change", (event: JournalReviewChangeEvent) => {
    broadcast({ channel: "journal-review", payload: event });
  });

  wss.on("connection", async (socket) => {
    const tasks = await Promise.all(taskRepository.list().map(withTicketHistory));
    socket.send(JSON.stringify({ channel: "snapshot", payload: { tasks } } satisfies ServerEvent));
    socket.send(
      JSON.stringify({ channel: "review-snapshot", payload: { items: await reviewQueueRepository.list() } } satisfies ServerEvent),
    );
    socket.send(
      JSON.stringify({
        channel: "journal-review-snapshot",
        payload: { items: await journalReviewRepository.list() },
      } satisfies ServerEvent),
    );
    const current = getHistory()[0];
    if (current) socket.send(JSON.stringify({ channel: "morning", payload: current } satisfies ServerEvent));
    const currentAnalysis = getJournalAnalysisHistory()[0];
    if (currentAnalysis) {
      socket.send(JSON.stringify({ channel: "journal-analysis", payload: currentAnalysis } satisfies ServerEvent));
    }
  });
}

export function broadcast(event: ServerEvent): void {
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}
