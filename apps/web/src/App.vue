<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTaskStore } from "./stores/taskStore";
import { useAutomationStore } from "./stores/automationStore";
import { useReviewQueueStore } from "./stores/reviewQueueStore";
import { useJournalReviewStore } from "./stores/journalReviewStore";
import { useNotifications } from "./composables/useNotifications";
import KanbanView from "./views/KanbanView.vue";
import PostItView from "./views/PostItView.vue";
import GraphView from "./views/GraphView.vue";
import MeetingsView from "./views/MeetingsView.vue";
import JournalView from "./views/JournalView.vue";
import ReviewQueueView from "./views/ReviewQueueView.vue";
import HistoryView from "./views/HistoryView.vue";
import TaskModal from "./components/TaskModal.vue";
import NoteModal from "./components/NoteModal.vue";
import MorningRunModal from "./components/MorningRunModal.vue";
import MeetingAlarmModal from "./components/MeetingAlarmModal.vue";
import AppSidebar from "./components/AppSidebar.vue";

const store = useTaskStore();
const automation = useAutomationStore();
const reviewQueue = useReviewQueueStore();
const journalReview = useJournalReviewStore();
const notifications = useNotifications();
const showMorningRun = ref(false);
// Desktop keeps the sidebar in-flow and open by default; mobile only ever
// shows it as an overlay drawer, so it should start collapsed there.
const sidebarOpen = ref(window.matchMedia("(min-width: 768px)").matches);

function startMyDay() {
  showMorningRun.value = true;
  automation.run();
}

function viewMorningRun() {
  showMorningRun.value = true;
}

const START_HOLD_MS = 500;
const startHolding = ref(false);
let startHoldTimer: number | undefined;
const isMobile = () => !window.matchMedia("(min-width: 768px)").matches;

function startHoldToBegin() {
  // Already running — just reopen the modal to watch it, no hold gesture
  // needed since this isn't starting anything new. (Once finished, the
  // dedicated "view last run" button covers reopening without a hold.)
  if (automation.current?.status === "running") {
    viewMorningRun();
    return;
  }
  if (!isMobile() || startHolding.value) return;
  startHolding.value = true;
  startHoldTimer = window.setTimeout(() => {
    startHolding.value = false;
    startMyDay();
  }, START_HOLD_MS);
}
function cancelStartHold() {
  startHolding.value = false;
  if (startHoldTimer !== undefined) {
    clearTimeout(startHoldTimer);
    startHoldTimer = undefined;
  }
}
function startMyDayClick() {
  if (isMobile()) return; // mobile requires the hold gesture instead of a plain click
  startMyDay();
}

type ViewMode = "postit" | "kanban" | "graph" | "meetings" | "journal" | "review" | "history";
const view = ref<ViewMode>("postit");
const groupBy = ref<"priority" | "time">("time");
const postItGroupBy = ref<"time" | "category">("time");
const openTaskId = ref<string | null>(null);
const openNote = ref<{ folder: string; id: string } | null>(null);

const openTask = computed(() => store.tasks.find((t) => t.id === openTaskId.value) ?? null);

function openTaskById(id: string) {
  openTaskId.value = id;
  store.markSeen(id);
}
function openTaskFromNote(taskId: string) {
  openNote.value = null;
  openTaskById(taskId);
}
function openNoteFromNote(folder: string, id: string) {
  openTaskId.value = null;
  openNote.value = { folder, id };
}

onMounted(() => {
  store.init();
  automation.init();
  reviewQueue.init();
  journalReview.init();
});
</script>

<template>
  <div class="app">
    <header>
      <button class="menu-btn" @click="sidebarOpen = true" aria-label="Open menu">☰</button>
      <h1>Task Hub</h1>
      <div class="right">
        <button
          class="start-my-day"
          :class="{ holding: startHolding }"
          :title="automation.current?.status === 'running' ? 'View run' : isMobile() ? 'Hold to start' : undefined"
          @click="startMyDayClick"
          @pointerdown="startHoldToBegin"
          @pointerup="cancelStartHold"
          @pointerleave="cancelStartHold"
          @pointercancel="cancelStartHold"
        >
          <span class="start-my-day-fill" :style="{ transitionDuration: startHolding ? `${START_HOLD_MS}ms` : '0ms' }"></span>
          <span class="start-my-day-label">
            {{ automation.current?.status === "running" ? "Running…" : startHolding ? "Keep holding…" : "Start my day" }}
          </span>
        </button>
        <button
          v-if="automation.current"
          class="view-run"
          title="View last run"
          aria-label="View last run"
          @click="viewMorningRun"
        >
          🕘
        </button>
        <button
          class="toggle-done"
          :class="{ active: !store.showDone }"
          :title="store.showDone ? 'Hide done' : 'Show done'"
          :aria-label="store.showDone ? 'Hide done' : 'Show done'"
          @click="store.toggleShowDone()"
        >
          <span class="toggle-done-icon">{{ store.showDone ? "👁️" : "🚫" }}</span>
        </button>
        <span class="status" :class="{ connected: store.connected }">{{ store.connected ? "live" : "reconnecting…" }}</span>
      </div>
    </header>

    <div class="body">
      <AppSidebar
        :open="sidebarOpen"
        :view="view"
        :group-by="groupBy"
        :post-it-group-by="postItGroupBy"
        :review-count="reviewQueue.items.length"
        :notifications-granted="notifications.permission === 'granted'"
        @close="sidebarOpen = false"
        @update:view="
          (v) => {
            view = v;
            if (isMobile()) sidebarOpen = false;
          }
        "
        @update:group-by="groupBy = $event"
        @update:post-it-group-by="postItGroupBy = $event"
        @request-notifications="notifications.requestPermission()"
      />

      <main :class="{ 'no-scroll': view === 'kanban' || view === 'graph' }">
        <PostItView
          v-if="view === 'postit'"
          :group-by="postItGroupBy"
          @open="openTaskById"
          @open-meeting="openNote = { folder: 'meetings', id: $event }"
        />
        <KanbanView
          v-else-if="view === 'kanban'"
          :group-by="groupBy"
          @open="openTaskById"
          @open-meeting="openNote = { folder: 'meetings', id: $event }"
        />
        <GraphView v-else-if="view === 'graph'" @open="openTaskById" @open-note="(folder, id) => (openNote = { folder, id })" />
        <MeetingsView
          v-else-if="view === 'meetings'"
          @open="openTaskById"
          @open-meeting="openNote = { folder: 'meetings', id: $event }"
        />
        <JournalView v-else-if="view === 'journal'" @open-entry="openNote = { folder: 'journal', id: $event }" />
        <ReviewQueueView v-else-if="view === 'review'" />
        <HistoryView v-else @open="openTaskById" />
      </main>
    </div>

    <TaskModal
      v-if="openTask"
      :task="openTask"
      mode="edit"
      @close="openTaskId = null"
      @complete="store.complete"
      @reopen="store.reopen"
      @link-meeting="
        (id, meeting) =>
          store.patch(id, { relatedMeeting: meeting ? { ...meeting, reminderFired: false } : null })
      "
      @set-due="(id, due) => store.patch(id, { due })"
      @set-tags="(id, tags) => store.patch(id, { tags })"
      @set-priority="(id, priority) => store.patch(id, { priority })"
      @set-title="(id, title) => store.patch(id, { title })"
      @set-body="(id, body) => store.patch(id, { body })"
      @delete="
        (id) => {
          store.deleteTask(id);
          openTaskId = null;
        }
      "
    />

    <NoteModal
      v-if="openNote"
      :folder="openNote.folder"
      :id="openNote.id"
      @close="openNote = null"
      @open-task="openTaskFromNote"
      @open-note="openNoteFromNote"
    />

    <MorningRunModal v-if="showMorningRun" @close="showMorningRun = false" />

    <MeetingAlarmModal
      v-if="store.meetingAlert"
      :title="store.meetingAlert.title"
      :note="store.meetingAlert.note"
      :minutes-until="store.meetingAlert.minutesUntil"
      @dismiss="store.dismissMeetingAlert()"
    />
  </div>
</template>

<style>
:root {
  color-scheme: light;

  --font-sans: "Outfit", system-ui, sans-serif;

  --color-bg: #f5f0e1;
  --color-ink: #2f2a24;
  --color-ink-soft: #5a5142;
  --color-accent: #c1673a;
  --color-surface: #fffdf8;
  --color-border: rgba(47, 42, 36, 0.16);

  --shadow-tint: 47, 42, 36;
  --shadow-sm: 0 1px 2px rgba(var(--shadow-tint), 0.12);
  --shadow-md: 0 4px 14px rgba(var(--shadow-tint), 0.16);
  --shadow-lg: 0 12px 32px rgba(var(--shadow-tint), 0.22);

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;

  --ease: cubic-bezier(0.2, 0.6, 0.2, 1);
}
body { margin: 0; font-family: var(--font-sans); background: var(--color-bg); color: var(--color-ink); }
* { font-variant-numeric: tabular-nums; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
</style>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; }
header {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2) var(--space-4); padding: var(--space-3) var(--space-4);
  background: var(--color-ink); color: white; flex-shrink: 0;
  box-shadow: var(--shadow-md);
}
header h1 { font-size: 1rem; font-weight: 600; letter-spacing: -0.01em; margin: 0; margin-right: var(--space-2); white-space: nowrap; }
.menu-btn {
  background: none; border: 1px solid rgba(255, 255, 255, 0.28); color: white;
  padding: 0.35rem 0.6rem; border-radius: var(--radius-sm); cursor: pointer;
  font-size: 1rem; line-height: 1; flex-shrink: 0;
  transition: background 160ms var(--ease), border-color 160ms var(--ease);
}
.menu-btn:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.45); }
.right button {
  background: none; border: 1px solid rgba(255, 255, 255, 0.28); color: white;
  padding: 0.35rem var(--space-3); border-radius: var(--radius-sm); cursor: pointer;
  font: inherit; font-size: 0.85rem; white-space: nowrap;
  transition: background 160ms var(--ease), border-color 160ms var(--ease), transform 120ms var(--ease);
}
.right button:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.45); }
.right button:active { transform: scale(0.97); }
.toggle-done.active { background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.5); }
.toggle-done-icon { font-size: 0.95rem; line-height: 1; }
.start-my-day {
  position: relative; overflow: hidden;
  background: var(--color-accent); border-color: var(--color-accent); font-weight: 600;
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.start-my-day:disabled { opacity: 0.7; cursor: default; }
.start-my-day-fill {
  position: absolute; inset: 0; width: 0%; background: rgba(255, 255, 255, 0.35);
  transition-property: width; transition-timing-function: linear;
}
.start-my-day.holding .start-my-day-fill { width: 100%; }
.start-my-day-label { position: relative; z-index: 1; }
.view-run { font-size: 0.95rem; line-height: 1; padding: 0.35rem 0.55rem; }
.right { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.status { font-size: 0.75rem; opacity: 0.6; white-space: nowrap; }
.status.connected { opacity: 1; color: #8be28b; }
.body { flex: 1; display: flex; min-height: 0; }
main { flex: 1; overflow-y: auto; min-height: 0; min-width: 0; }
main.no-scroll { overflow: hidden; }

@media (max-width: 640px) {
  header { gap: var(--space-2); }
  header h1 { display: none; }
  .right { gap: var(--space-1); }
  .right button { padding: 0.3rem 0.55rem; font-size: 0.78rem; }
  .status { font-size: 0.68rem; }
}
</style>
