<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTaskStore } from "./stores/taskStore";
import { useNotifications } from "./composables/useNotifications";
import KanbanView from "./views/KanbanView.vue";
import ListView from "./views/ListView.vue";
import PostItView from "./views/PostItView.vue";
import TaskDetailDrawer from "./components/TaskDetailDrawer.vue";

const store = useTaskStore();
const notifications = useNotifications();

type ViewMode = "postit" | "kanban" | "list";
const view = ref<ViewMode>("postit");
const groupBy = ref<"priority" | "time">("time");
const openTaskId = ref<string | null>(null);

const openTask = computed(() => store.tasks.find((t) => t.id === openTaskId.value) ?? null);

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
        <button :class="{ active: view === 'list' }" @click="view = 'list'">List</button>
      </nav>
      <div class="right">
        <select v-if="view === 'kanban'" v-model="groupBy">
          <option value="time">By time period</option>
          <option value="priority">By priority</option>
        </select>
        <button v-if="notifications.permission !== 'granted'" @click="notifications.requestPermission()">
          Enable reminders
        </button>
        <span class="status" :class="{ connected: store.connected }">{{ store.connected ? "live" : "reconnecting…" }}</span>
      </div>
    </header>

    <main :class="{ 'no-scroll': view === 'kanban' }">
      <PostItView v-if="view === 'postit'" @open="openTaskId = $event" />
      <KanbanView v-else-if="view === 'kanban'" :group-by="groupBy" @open="openTaskId = $event" />
      <ListView v-else @open="openTaskId = $event" />
    </main>

    <TaskDetailDrawer
      :task="openTask"
      @close="openTaskId = null"
      @complete="store.complete"
      @reopen="store.reopen"
      @link-meeting="
        (id, meeting) =>
          store.patch(id, { relatedMeeting: meeting ? { ...meeting, reminderFired: false } : null })
      "
      @set-due="(id, due) => store.patch(id, { due })"
      @set-tags="(id, tags) => store.patch(id, { tags })"
    />
  </div>
</template>

<style>
:root { color-scheme: light; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f5f0e1; }
</style>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; }
header {
  display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem;
  background: #2f2a24; color: white; flex-shrink: 0;
}
header h1 { font-size: 1rem; margin: 0; margin-right: 1rem; }
.view-switch button, .right button { background: none; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 0.3rem 0.75rem; border-radius: 6px; cursor: pointer; }
.view-switch button.active { background: rgba(255,255,255,0.2); }
.right { margin-left: auto; display: flex; align-items: center; gap: 0.5rem; }
.status { font-size: 0.75rem; opacity: 0.6; }
.status.connected { opacity: 1; color: #8be28b; }
main { flex: 1; overflow-y: auto; min-height: 0; }
main.no-scroll { overflow: hidden; }
</style>
