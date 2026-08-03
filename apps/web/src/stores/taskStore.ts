import { defineStore } from "pinia";
import type { Task } from "../types";
import { useAutomationStore } from "./automationStore";
import { useReviewQueueStore } from "./reviewQueueStore";
import { startMeetingAlarm, stopMeetingAlarm } from "../utils/chime";

interface MeetingAlert {
  taskId?: string;
  title: string;
  note?: string;
  minutesUntil?: number;
}

interface State {
  tasks: Task[];
  connected: boolean;
  showDone: boolean;
  meetingAlert: MeetingAlert | null;
}

let socket: WebSocket | undefined;

export const useTaskStore = defineStore("tasks", {
  state: (): State => ({ tasks: [], connected: false, showDone: true, meetingAlert: null }),

  actions: {
    toggleShowDone() {
      this.showDone = !this.showDone;
    },

    async init() {
      const res = await fetch("/api/tasks");
      this.tasks = await res.json();
      this.connectSocket();
    },

    connectSocket() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${location.host}/ws`);

      socket.onopen = () => (this.connected = true);
      socket.onclose = () => {
        this.connected = false;
        setTimeout(() => this.connectSocket(), 2000);
      };
      socket.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
    },

    handleMessage(msg: { channel: string; payload: any }) {
      if (msg.channel === "snapshot") {
        this.tasks = msg.payload.tasks;
        return;
      }
      if (msg.channel === "task") {
        const { type, task, id } = msg.payload;
        if (type === "added" && task) {
          if (!this.tasks.some((t) => t.id === task.id)) this.tasks.push(task);
        } else if (type === "updated" && task) {
          const idx = this.tasks.findIndex((t) => t.id === task.id);
          if (idx >= 0) this.tasks[idx] = task;
          else this.tasks.push(task);
        } else if (type === "removed" && id) {
          this.tasks = this.tasks.filter((t) => t.id !== id);
        }
        return;
      }
      if (msg.channel === "meeting") {
        this.notifyMeeting(msg.payload);
        return;
      }
      if (msg.channel === "morning") {
        useAutomationStore().applyRun(msg.payload);
        return;
      }
      if (msg.channel === "review-snapshot") {
        useReviewQueueStore().applySnapshot(msg.payload.items);
        return;
      }
      if (msg.channel === "review") {
        useReviewQueueStore().applyChange(msg.payload);
      }
    },

    notifyMeeting(payload: MeetingAlert) {
      this.meetingAlert = payload;
      startMeetingAlarm(); // keeps ringing until dismissMeetingAlert()

      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const heading =
        payload.minutesUntil != null
          ? `Meeting in ${payload.minutesUntil} min: ${payload.title}`
          : `Meeting starting: ${payload.title}`;
      new Notification(heading, { body: payload.note || "Open the linked task." });
    },

    dismissMeetingAlert() {
      stopMeetingAlarm();
      this.meetingAlert = null;
    },

    async createTask(input: Partial<Task> & { title: string }) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },

    async complete(id: string) {
      await fetch(`/api/tasks/${id}/complete`, { method: "POST" });
    },

    async reopen(id: string, note?: string) {
      await fetch(`/api/tasks/${id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
    },

    async deleteTask(id: string) {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      this.tasks = this.tasks.filter((t) => t.id !== id);
    },

    async patch(id: string, patch: Partial<Task>) {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
  },
});
