<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTaskStore } from "./stores/taskStore";
import { useNotifications } from "./composables/useNotifications";
import KanbanView from "./views/KanbanView.vue";
import PostItView from "./views/PostItView.vue";
import GraphView from "./views/GraphView.vue";
import TaskModal from "./components/TaskModal.vue";
import NoteModal from "./components/NoteModal.vue";

const store = useTaskStore();
const notifications = useNotifications();

type ViewMode = "postit" | "kanban" | "graph";
const view = ref<ViewMode>("postit");
const groupBy = ref<"priority" | "time">("time");
const openTaskId = ref<string | null>(null);
const openNote = ref<{ folder: string; id: string } | null>(null);

const openTask = computed(() => store.tasks.find((t) => t.id === openTaskId.value) ?? null);

function openTaskFromNote(taskId: string) {
  openNote.value = null;
  openTaskId.value = taskId;
}
function openNoteFromNote(folder: string, id: string) {
  openTaskId.value = null;
  openNote.value = { folder, id };
}

onMounted(() => {
  store.init();
});
</script>

<template>
  <div class="app">
    <header>
      <h1>Task Hub</h1>
      <nav class="view-switch">
        <button :class="{ active: view === 'postit' }" @click="view = 'postit'">Post-its</button>
        <button :class="{ active: view === 'kanban' }" @click="view = 'kanban'">Kanban</button>
        <button :class="{ active: view === 'graph' }" @click="view = 'graph'">Graph</button>
      </nav>
      <div class="right">
        <select v-if="view === 'kanban'" v-model="groupBy">
          <option value="time">By time period</option>
          <option value="priority">By priority</option>
        </select>
        <button class="toggle-done" :class="{ active: !store.showDone }" @click="store.toggleShowDone()">
          {{ store.showDone ? "Hide done" : "Show done" }}
        </button>
        <button v-if="notifications.permission !== 'granted'" @click="notifications.requestPermission()">
          Enable reminders
        </button>
        <span class="status" :class="{ connected: store.connected }">{{ store.connected ? "live" : "reconnecting…" }}</span>
      </div>
    </header>

    <main :class="{ 'no-scroll': view === 'kanban' || view === 'graph' }">
      <PostItView v-if="view === 'postit'" @open="openTaskId = $event" />
      <KanbanView v-else-if="view === 'kanban'" :group-by="groupBy" @open="openTaskId = $event" />
      <GraphView v-else @open="openTaskId = $event" @open-note="(folder, id) => (openNote = { folder, id })" />
    </main>

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
.view-switch { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.view-switch button, .right button {
  background: none; border: 1px solid rgba(255, 255, 255, 0.28); color: white;
  padding: 0.35rem var(--space-3); border-radius: var(--radius-sm); cursor: pointer;
  font: inherit; font-size: 0.85rem; white-space: nowrap;
  transition: background 160ms var(--ease), border-color 160ms var(--ease), transform 120ms var(--ease);
}
.view-switch button:hover, .right button:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.45); }
.view-switch button:active, .right button:active { transform: scale(0.97); }
.view-switch button.active { background: var(--color-accent); border-color: var(--color-accent); }
.toggle-done.active { background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.5); }
.right { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.right select {
  font: inherit; font-size: 0.85rem; background: rgba(255, 255, 255, 0.08); color: white;
  border: 1px solid rgba(255, 255, 255, 0.28); border-radius: var(--radius-sm); padding: 0.35rem var(--space-2);
}
.status { font-size: 0.75rem; opacity: 0.6; white-space: nowrap; }
.status.connected { opacity: 1; color: #8be28b; }
main { flex: 1; overflow-y: auto; min-height: 0; }
main.no-scroll { overflow: hidden; }

@media (max-width: 640px) {
  header { justify-content: center; }
  header h1 { width: 100%; text-align: center; margin-right: 0; }
  .view-switch { justify-content: center; width: 100%; }
  .right { width: 100%; justify-content: center; }
}
</style>
