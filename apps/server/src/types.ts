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
  tags: string[];
  source: TaskSource;
  relatedMeeting: RelatedMeeting | null;
  history: HistoryEntry[];
  body: string;
  /** Absolute path to the backing markdown file, not part of the frontmatter. */
  filePath: string;
}

export type NewTaskInput = Pick<Task, "title"> &
  Partial<Pick<Task, "priority" | "due" | "tags" | "source" | "relatedMeeting" | "body">>;
