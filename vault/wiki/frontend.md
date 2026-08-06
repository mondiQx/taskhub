---
title: task-hub frontend
---

# Frontend (`apps/web`)

Vue 3.5 + Vite 6 + Pinia 2. No vue-router — view switching is a single
`ref<ViewMode>` in `App.vue`.

## Views (`src/views/`)

- **PostItView.vue** — post-it board, grouped by time period/category.
- **KanbanView.vue** — kanban board, grouped by priority/time period.
- **GraphView.vue** — renders `/api/graph`; reads `taskStore.showDone`
  directly (not via `useTasks`) to filter done tasks out of the graph too.
- **MeetingsView.vue** — meeting list; shows a status dot per linked task
  regardless of status (doesn't filter by `showDone`).
- **JournalView.vue** — daily journal entries.
- **ReviewQueueView.vue** — Gmail review-queue + journal-review confirm/
  reject UI.
- **HistoryView.vue** — full log of done tasks, deliberately ignoring
  `showDone` (that's its whole purpose).

`App.vue` holds `view = ref<ViewMode>("postit")`,
`ViewMode = "postit" | "kanban" | "graph" | "meetings" | "journal" | "review" | "history"`.
`AppSidebar.vue` emits `update:view` to switch. Modals (`TaskModal`,
`NoteModal`, `MorningRunModal`, `MeetingAlarmModal`) are toggled by local
refs, not routes.

## Stores (`src/stores/`)

- **taskStore.ts** — the task list + the one WebSocket connection
  (`init()` → `GET /api/tasks` → `connectSocket()`). `showDone: boolean`
  (defaults `false`) controls whether done tasks appear in the open-task
  views; `toggleShowDone()` flips it. The header's "Show done" toggle
  button in `App.vue` is bound to this.
- **meetingsStore.ts** — meeting list + `upcomingItems(lookaheadDays)`,
  backed by `src/utils/upcomingMeetings.ts`'s recurrence projection.
- **automationStore.ts** — `/morning` run state.
- **journalAnalysisStore.ts**, **journalReviewStore.ts**,
  **reviewQueueStore.ts** — corresponding review-queue/analysis state.

## Composables (`src/composables/`)

- **useGrouping.ts** — pure functions: `timeBucketFor()` (buckets:
  overdue/today/thisWeek/thisMonth/thisQuarter/deferred/someday),
  `groupByPriority()`, `groupByTimePeriod()`, `categoryFor()`,
  `suggestedDueDateForBucket()` (used when a task is dragged to a new
  Kanban column).
- **useTasks.ts** — combines `taskStore` with `useGrouping`:
  - `allOpenTasks` excludes only `archived` (independent of `showDone` by
    design, to keep group membership/fold thresholds stable)
  - `openTasks` applies `showDone` (and filters stale-done tasks)
  - `byPriority`, `byTimePeriod`, `byCategory` derive from `openTasks`, so
    they inherit the `showDone` filter automatically
  - `history` deliberately ignores `showDone`, feeding `HistoryView.vue`
- **useNotifications.ts** — browser notifications for meeting reminders.
- **useTaskAging.ts** — staleness/aging calculations for open tasks.
- **useVoiceCapture.ts** — Web Speech API wrapper for dictated task/journal
  capture.

## Utils worth knowing

- **src/utils/upcomingMeetings.ts** — projects recurring meeting
  occurrences from a single cached instance + a parsed cadence (e.g.
  "Every Monday"), bounded by `lookaheadDays` for both recurring and
  non-recurring meetings (kept consistent as of the August 2026 fix — see
  git history around `computeUpcomingItems`).
