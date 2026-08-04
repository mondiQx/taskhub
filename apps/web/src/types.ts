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

export interface ReviewItem {
  id: string;
  subject: string;
  reason: string;
  threadId: string;
  from: string;
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
  tags: string[];
  source: TaskSource;
  relatedMeeting: RelatedMeeting | null;
  history: HistoryEntry[];
  body: string;
  filePath: string;
}
