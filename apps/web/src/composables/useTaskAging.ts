import { computed, type Ref } from "vue";
import type { Task } from "../types";

const DAY_MS = 86_400_000;

export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - Date.parse(iso)) / DAY_MS);
}

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((Date.parse(iso) - now) / DAY_MS);
}

/** Reactive aging info for a single task: age, due countdown, and how long it's been open (procrastination). */
export function useTaskAging(task: Ref<Task>) {
  const daysSinceCreated = computed(() => daysSince(task.value.created));

  const dueInDays = computed(() => (task.value.due ? daysUntil(task.value.due) : null));

  const isOverdue = computed(() => dueInDays.value !== null && dueInDays.value < 0 && task.value.status !== "done");

  const procrastinationDays = computed(() => (task.value.status === "done" ? 0 : daysSinceCreated.value));

  return { daysSinceCreated, dueInDays, isOverdue, procrastinationDays };
}
