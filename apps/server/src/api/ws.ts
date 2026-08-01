import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { taskRepository, type TaskChangeEvent } from "../vault/taskRepository.js";

export type ServerEvent =
  | { channel: "task"; payload: TaskChangeEvent }
  | { channel: "snapshot"; payload: { tasks: ReturnType<typeof taskRepository.list> } }
  | { channel: "meeting"; payload: { taskId: string; title: string; note: string } };

let wss: WebSocketServer | undefined;

export function startWebSocketServer(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  taskRepository.on("change", (event: TaskChangeEvent) => {
    broadcast({ channel: "task", payload: event });
  });

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ channel: "snapshot", payload: { tasks: taskRepository.list() } } satisfies ServerEvent));
  });
}

export function broadcast(event: ServerEvent): void {
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}
