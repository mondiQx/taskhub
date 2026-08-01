import type { Task, TaskPriority } from "../types";

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

export type TimeBucket = "overdue" | "today" | "thisWeek" | "thisMonth" | "thisQuarter" | "deferred" | "someday";

const TIME_BUCKET_ORDER: TimeBucket[] = ["overdue", "today", "thisWeek", "thisMonth", "thisQuarter", "deferred", "someday"];
const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  thisWeek: "This Week",
  thisMonth: "This Month",
  thisQuarter: "This Quarter",
  deferred: "Deferred",
  someday: "Someday",
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function endOfQuarter(date: Date): Date {
  const quarterEndMonth = Math.floor(date.getMonth() / 3) * 3 + 2;
  const d = new Date(date.getFullYear(), quarterEndMonth + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

export function timeBucketFor(task: Task, now = new Date()): TimeBucket {
  if (!task.due) return "someday";
  const due = new Date(task.due);
  const diffDays = daysBetween(now, due);

  if (diffDays < 0 && task.status !== "done") return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays >= 1 && diffDays <= 7) return "thisWeek";

  const monthEndDiff = daysBetween(now, endOfMonth(now));
  const quarterEndDiff = daysBetween(now, endOfQuarter(now));
  if (diffDays > 7 && diffDays <= monthEndDiff) return "thisMonth";
  if (diffDays > monthEndDiff && diffDays <= quarterEndDiff) return "thisQuarter";
  return "deferred";
}

/** A representative ISO due date for the target bucket, used when a task is dragged onto a Kanban column. */
export function suggestedDueDateForBucket(bucket: TimeBucket, now = new Date()): string | null {
  const today = startOfDay(now);

  if (bucket === "someday") return null;
  if (bucket === "overdue") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  if (bucket === "today") return today.toISOString();
  if (bucket === "thisWeek") {
    const d = new Date(today);
    d.setDate(d.getDate() + 3);
    return d.toISOString();
  }

  const eom = endOfMonth(today);
  if (bucket === "thisMonth") {
    const d = new Date(today);
    d.setDate(d.getDate() + 8);
    return (d <= eom ? d : eom).toISOString();
  }

  const eoq = endOfQuarter(today);
  if (bucket === "thisQuarter") {
    const midpoint = new Date((eom.getTime() + eoq.getTime()) / 2);
    const d = midpoint > eom ? midpoint : new Date(eom.getTime() + 3 * 86_400_000);
    return (d <= eoq ? d : eoq).toISOString();
  }

  // deferred
  const d = new Date(eoq);
  d.setDate(d.getDate() + 14);
  return d.toISOString();
}

export function groupByPriority(tasks: Task[]): Array<{ key: TaskPriority; label: string; tasks: Task[] }> {
  return PRIORITY_ORDER.map((priority) => ({
    key: priority,
    label: priority[0].toUpperCase() + priority.slice(1),
    tasks: tasks.filter((t) => t.priority === priority),
  }));
}

export function groupByTimePeriod(tasks: Task[], now = new Date()): Array<{ key: TimeBucket; label: string; tasks: Task[] }> {
  return TIME_BUCKET_ORDER.map((bucket) => ({
    key: bucket,
    label: TIME_BUCKET_LABELS[bucket],
    tasks: tasks.filter((t) => timeBucketFor(t, now) === bucket),
  }));
}

/** Buckets that default to a collapsed "folder" view since they aren't time-critical. */
export const FOLDED_TIME_BUCKETS: ReadonlySet<TimeBucket> = new Set(["deferred", "someday"]);

/**
 * Category for grouping regardless of due date — e.g. Jira tickets by project/board
 * (from the "jira" + project tags the sync writes), everything else by its first tag
 * or source type as a fallback.
 */
export function categoryFor(task: Task): string {
  if (task.source.type === "jira") {
    const project = task.tags.find((t) => t !== "jira");
    return project ? project.toUpperCase() : "Jira";
  }
  if (task.tags.length) return task.tags[0][0].toUpperCase() + task.tags[0].slice(1);
  return task.source.type[0].toUpperCase() + task.source.type.slice(1);
}

export function groupByCategory(tasks: Task[]): Array<{ key: string; label: string; tasks: Task[] }> {
  const byCategory = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = categoryFor(task);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(task);
  }
  return [...byCategory.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, categoryTasks]) => ({ key, label: key, tasks: categoryTasks }));
}
