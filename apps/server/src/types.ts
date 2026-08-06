import type { TicketHistoryEntry } from "./vault/ticketBridge.js";

export type TaskStatus = "open" | "in-progress" | "done" | "archived";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type SourceType = "gmail" | "jira" | "slack" | "gcal" | "manual" | "voice";

export interface TaskSource {
  type: SourceType;
  externalId: string | null;
  url: string | null;
}

export interface RelatedMeeting {
  eventId: string;
  title: string;
  start: string;
  reminderFired: boolean;
}

export interface HistoryEntry {
  at: string;
  event: "created" | "reopened" | "completed" | "updated";
  note?: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  created: string;
  due: string | null;
  completedAt: string | null;
  /** null until a user opens the task (on any device) — drives the "New" badge. Not a history event. */
  seenAt: string | null;
  tags: string[];
  source: TaskSource;
  relatedMeeting: RelatedMeeting | null;
  history: HistoryEntry[];
  body: string;
  /** Absolute path to the backing markdown file, not part of the frontmatter. */
  filePath: string;
  /**
   * Read-time, best-effort annotation from customizer-core's ticket-history
   * knowledge file — not part of the frontmatter, never persisted. Only set
   * for jira-sourced tasks when `CUSTOMIZER_CORE_PATH` is configured.
   */
  ticketHistory?: TicketHistoryEntry | null;
}

export type NewTaskInput = Pick<Task, "title"> &
  Partial<Pick<Task, "priority" | "due" | "tags" | "source" | "relatedMeeting" | "body">>;
