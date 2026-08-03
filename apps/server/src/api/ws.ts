import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { taskRepository, type TaskChangeEvent } from "../vault/taskRepository.js";
import { getHistory, morningEvents, type MorningRun } from "../automation/morningRun.js";
import { reviewQueueRepository, type ReviewChangeEvent, type ReviewItem } from "../vault/reviewQueue.js";

export type ServerEvent =
  | { channel: "task"; payload: TaskChangeEvent }
  | { channel: "snapshot"; payload: { tasks: ReturnType<typeof taskRepository.list> } }
  | { channel: "meeting"; payload: { taskId: string; title: string; note: string } }
  | { channel: "meeting"; payload: { title: string; minutesUntil: number } }
  | { channel: "morning"; payload: MorningRun }
  | { channel: "review"; payload: ReviewChangeEvent }
  | { channel: "review-snapshot"; payload: { items: ReviewItem[] } };

let wss: WebSocketServer | undefined;

export function startWebSocketServer(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  taskRepository.on("change", (event: TaskChangeEvent) => {
    broadcast({ channel: "task", payload: event });
  });

  morningEvents.on("change", (run: MorningRun) => {
    broadcast({ channel: "morning", payload: run });
  });

  reviewQueueRepository.on("change", (event: ReviewChangeEvent) => {
    broadcast({ channel: "review", payload: event });
  });

  wss.on("connection", async (socket) => {
    socket.send(JSON.stringify({ channel: "snapshot", payload: { tasks: taskRepository.list() } } satisfies ServerEvent));
    socket.send(
      JSON.stringify({ channel: "review-snapshot", payload: { items: await reviewQueueRepository.list() } } satisfies ServerEvent),
    );
    const current = getHistory()[0];
    if (current) socket.send(JSON.stringify({ channel: "morning", payload: current } satisfies ServerEvent));
  });
}

export function broadcast(event: ServerEvent): void {
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}
