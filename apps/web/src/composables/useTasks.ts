import { computed } from "vue";
import { useTaskStore } from "../stores/taskStore";
import { groupByCategory, groupByPriority, groupByTimePeriod, isStaleDone } from "./useGrouping";

/** Thin convenience layer over the task store for views that just need the live list + groupings. */
export function useTasks() {
  const store = useTaskStore();

  // Excludes only archived tasks — independent of the show/hide-done toggle, so
  // group membership and fold thresholds stay stable regardless of its state.
  const allOpenTasks = computed(() => store.tasks.filter((t) => t.status !== "archived"));
  // Stale-done tasks (completed long enough ago to belong in History) are excluded
  // from the boards regardless of showDone — showDone only governs recently-done tasks.
  const openTasks = computed(() =>
    allOpenTasks.value.filter((t) => (store.showDone || t.status !== "done") && !isStaleDone(t)),
  );

  const byPriority = computed(() => groupByPriority(openTasks.value));
  const byTimePeriod = computed(() => groupByTimePeriod(openTasks.value));
  const byCategory = computed(() => groupByCategory(openTasks.value));

  // Every done task, stale or not — this is the full log so nothing hidden from
  // the boards by isStaleDone ever falls through a gap.
  const history = computed(() =>
    store.tasks
      .filter((t) => t.status === "done")
      .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()),
  );

  return { store, openTasks, allOpenTasks, byPriority, byTimePeriod, byCategory, history };
}
