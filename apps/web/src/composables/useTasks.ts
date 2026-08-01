import { computed } from "vue";
import { useTaskStore } from "../stores/taskStore";
import { groupByCategory, groupByPriority, groupByTimePeriod } from "./useGrouping";

/** Thin convenience layer over the task store for views that just need the live list + groupings. */
export function useTasks() {
  const store = useTaskStore();

  const openTasks = computed(() => store.tasks.filter((t) => t.status !== "archived"));
  const byPriority = computed(() => groupByPriority(openTasks.value));
  const byTimePeriod = computed(() => groupByTimePeriod(openTasks.value));
  const byCategory = computed(() => groupByCategory(openTasks.value));
  const history = computed(() => store.tasks.filter((t) => t.status === "done" || t.history.length > 1));

  return { store, openTasks, byPriority, byTimePeriod, byCategory, history };
}
