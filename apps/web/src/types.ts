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

/**
 * A single entry from customizer-core's `knowledge/ticket-history.json`,
 * attached read-only to a Jira-sourced task's detail response. See
 * `apps/server/src/vault/ticketBridge.ts` for how this is looked up.
 */
export interface TicketHistoryEntry {
  key?: string;
  title?: string;
  rootCause?: string | null;
  fixType?: string | null;
  responsibleTeam?: string | null;
  confidence?: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  start: string;
  end?: string;
  attendees?: string[];
  eventId?: string;
  recurringEventId?: string;
  hub?: string;
  source?: string;
  url?: string;
  recurs?: string;
}

export interface JournalEntrySummary {
  date: string;
  preview: string;
}

export interface GmailReviewItem {
  kind: "gmail";
  id: string;
  subject: string;
  reason: string;
  threadId: string;
  from: string;
  sourceFile: string;
}

export interface NoteExcerptReviewItem {
  kind: "note-excerpt";
  id: string;
  subject: string;
  reason: string;
  targetNoteId: string | null;
  taskId: string;
  sourceFile: string;
}

export type ReviewItem = GmailReviewItem | NoteExcerptReviewItem;

export interface JournalReviewItem {
  id: string;
  date: string;
  description: string;
  targetLabel: string;
  payload: Record<string, unknown>;
  sourceFile: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  created: string;
  due: string | null;
  completedAt: string | null;
  seenAt: string | null;
  tags: string[];
  source: TaskSource;
  relatedMeeting: RelatedMeeting | null;
  history: HistoryEntry[];
  body: string;
  filePath: string;
  /**
   * Read-time, best-effort annotation from customizer-core's ticket-history
   * knowledge file. Only set for jira-sourced tasks.
   */
  ticketHistory?: TicketHistoryEntry | null;
}
