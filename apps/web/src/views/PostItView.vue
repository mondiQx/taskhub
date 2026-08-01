<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { motion, AnimatePresence } from "motion-v";
import { useTasks } from "../composables/useTasks";
import { useVoiceCapture } from "../composables/useVoiceCapture";
import PostItNote from "../components/PostItNote.vue";
import PostItFolder from "../components/PostItFolder.vue";
import TaskModal from "../components/TaskModal.vue";
import type { Task, TaskPriority } from "../types";
import { colorForId } from "../utils/noteColor";

const emit = defineEmits<{ open: [id: string] }>();
const { store, openTasks, byTimePeriod, byCategory } = useTasks();

const groupBy = ref<"time" | "category">("time");
const search = ref("");
const showAddModal = ref(false);
const expandedKeys = ref<Set<string>>(new Set());

// Every non-empty group renders as a folder, regardless of size — a single task
// moved into "Today" should be just as visible as an overflowing bucket, not a
// bare unlabeled card blending into the rest of the board.

// Auto-expand the most urgent non-empty time bucket once tasks first load,
// so e.g. if the earliest deadlines fall in "This Week" that folder opens by default.
let autoExpanded = false;
watch(
  byTimePeriod,
  (buckets) => {
    if (autoExpanded) return;
    const totalTasks = buckets.reduce((n, g) => n + g.tasks.length, 0);
    if (totalTasks === 0) return;
    autoExpanded = true;
    const critical = buckets.find((g) => g.tasks.length > 0);
    if (critical) expandedKeys.value = new Set([critical.key]);
  },
  { immediate: true },
);

type Cell =
  | { type: "note"; task: Task }
  | { type: "folder"; key: string; label: string; count: number; previews: string[]; expanded: boolean };

const groups = computed(() => (groupBy.value === "time" ? byTimePeriod.value : byCategory.value));

const cells = computed<Cell[]>(() => {
  const out: Cell[] = [];
  for (const group of groups.value) {
    if (!group.tasks.length) continue;
    const expanded = expandedKeys.value.has(group.key);
    const previews = group.tasks.slice(0, 4).map((t) => colorForId(t.id));
    out.push({ type: "folder", key: group.key, label: group.label, count: group.tasks.length, previews, expanded });
    if (expanded) {
      for (const task of group.tasks) out.push({ type: "note", task });
    }
  }
  return out;
});

const searching = computed(() => search.value.trim().length > 0);

const searchMatches = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return [];
  return openTasks.value.filter(
    (t) => t.title.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
});

function toggleFolder(key: string) {
  const next = new Set(expandedKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedKeys.value = next;
}

const voice = useVoiceCapture((transcript) => {
  store.createTask({ title: transcript, source: { type: "voice", externalId: null, url: null } });
});

async function createFromModal(payload: { title: string; body: string; priority: TaskPriority; due: string | null; tags: string[] }) {
  await store.createTask({
    title: payload.title,
    body: payload.body,
    priority: payload.priority,
    due: payload.due,
    tags: payload.tags,
    source: { type: "manual", externalId: null, url: null },
  });
  showAddModal.value = false;
}
</script>

<template>
  <div class="postits">
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input v-model="search" type="text" class="search" placeholder="Search notes and tags..." />
      </div>
      <button
        v-if="voice.supported"
        type="button"
        class="mic"
        :class="{ recording: voice.recording }"
        @click="voice.recording ? voice.stop() : voice.start()"
      >
        {{ voice.recording ? "● Stop" : "🎤" }}
      </button>
      <select v-model="groupBy" class="group-select" :disabled="searching">
        <option value="time">Group by time</option>
        <option value="category">Group by category</option>
      </select>
      <button class="add-btn" @click="showAddModal = true">+ Add task</button>
    </div>
    <p v-if="voice.interimTranscript" class="interim">{{ voice.interimTranscript }}</p>

    <div v-if="searching" class="board">
      <PostItNote
        v-for="task in searchMatches"
        :key="task.id"
        :task="task"
        @complete="store.complete"
        @reopen="store.reopen"
        @open="emit('open', $event)"
      />
      <p v-if="!searchMatches.length" class="empty">No matches for "{{ search }}"</p>
    </div>

    <motion.div v-else class="board" layout>
      <AnimatePresence>
        <template v-for="cell in cells" :key="cell.type === 'note' ? cell.task.id : `folder:${cell.key}`">
          <motion.div
            v-if="cell.type === 'note'"
            layout
            :initial="{ opacity: 0, scale: 0.85, y: -6 }"
            :animate="{ opacity: 1, scale: 1, y: 0 }"
            :exit="{ opacity: 0, scale: 0.85 }"
            :transition="{ duration: 0.18 }"
          >
            <PostItNote
              :task="cell.task"
              @complete="store.complete"
              @reopen="store.reopen"
              @open="emit('open', $event)"
            />
          </motion.div>
          <motion.div v-else layout :transition="{ duration: 0.18 }">
            <PostItFolder
              :label="cell.label"
              :count="cell.count"
              :previews="cell.previews"
              :expanded="cell.expanded"
              @toggle="toggleFolder(cell.key)"
            />
          </motion.div>
        </template>
      </AnimatePresence>
    </motion.div>

    <TaskModal
      v-if="showAddModal"
      :task="null"
      mode="create"
      @close="showAddModal = false"
      @create="createFromModal"
    />
  </div>
</template>

<style scoped>
.postits { padding: 1rem; }
.toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; align-items: center; }
.search-wrap { flex: 1 1 200px; display: flex; align-items: center; gap: 0.4rem; padding: 0 0.6rem; border-radius: 6px; border: 1px solid #ccc; background: #fff; }
.search-icon { opacity: 0.5; font-size: 0.85rem; }
.search { flex: 1; border: none; padding: 0.5rem 0; background: none; font: inherit; }
.search:focus { outline: none; }
.mic.recording { background: #e5484d; color: white; }
.group-select { padding: 0.4rem; border-radius: 6px; border: 1px solid #ccc; }
.add-btn { background: #2f2a24; color: white; border: none; border-radius: 6px; padding: 0.5rem 0.9rem; cursor: pointer; white-space: nowrap; }
.interim { font-size: 0.8rem; opacity: 0.6; margin: 0.25rem 0 0.75rem; }
.board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  align-items: start;
  gap: 1rem;
}
.empty { opacity: 0.6; font-size: 0.9rem; }
</style>
