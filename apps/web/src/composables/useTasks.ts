import { computed } from "vue";
import { useTaskStore } from "../stores/taskStore";
import { groupByCategory, groupByPriority, groupByTimePeriod } from "./useGrouping";

/** Thin convenience layer over the task store for views that just need the live list + groupings. */
export function useTasks() {
  const store = useTaskStore();

  // Excludes only archived tasks — independent of the show/hide-done toggle, so
  // group membership and fold thresholds stay stable regardless of its state.
  const allOpenTasks = computed(() => store.tasks.filter((t) => t.status !== "archived"));
  const openTasks = computed(() => allOpenTasks.value.filter((t) => store.showDone || t.status !== "done"));

  const byPriority = computed(() => groupByPriority(openTasks.value));
  const byTimePeriod = computed(() => groupByTimePeriod(openTasks.value));
  const byCategory = computed(() => groupByCategory(openTasks.value));

  const history = computed(() => store.tasks.filter((t) => t.status === "done" || t.history.length > 1));

  return { store, openTasks, allOpenTasks, byPriority, byTimePeriod, byCategory, history };
}
