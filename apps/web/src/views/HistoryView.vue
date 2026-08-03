<script setup lang="ts">
import { computed, ref } from "vue";
import { useTasks } from "../composables/useTasks";
import TaskCard from "../components/TaskCard.vue";

defineEmits<{ open: [id: string] }>();
const { store, history } = useTasks();

const search = ref("");

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return history.value;
  return history.value.filter(
    (t) => t.title.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
});

function completedLabel(completedAt: string | null): string {
  if (!completedAt) return "";
  return new Date(completedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
</script>

<template>
  <div class="history">
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input v-model="search" type="text" class="search" placeholder="Search completed tasks..." />
      </div>
    </div>
    <ul class="list">
      <li v-for="task in filtered" :key="task.id" class="row">
        <span class="completed-at">{{ completedLabel(task.completedAt) }}</span>
        <div class="card">
          <TaskCard :task="task" @complete="store.complete" @reopen="store.reopen" @open="$emit('open', $event)" />
        </div>
      </li>
      <p v-if="!filtered.length" class="empty">No completed tasks{{ search ? ` matching "${search}"` : "" }} yet.</p>
    </ul>
  </div>
</template>

<style scoped>
.history { padding: 1rem; max-width: 720px; margin: 0 auto; }
.toolbar { display: flex; margin-bottom: 0.75rem; }
.search-wrap { flex: 1; display: flex; align-items: center; gap: 0.4rem; padding: 0 0.6rem; border-radius: 6px; border: 1px solid #ccc; background: #fff; }
.search-icon { opacity: 0.5; font-size: 0.85rem; }
.search { flex: 1; border: none; padding: 0.5rem 0; background: none; font: inherit; }
.search:focus { outline: none; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.row { display: flex; align-items: center; gap: 0.75rem; }
.completed-at { width: 90px; flex-shrink: 0; font-size: 0.75rem; opacity: 0.6; text-align: right; }
.card { flex: 1; min-width: 0; }
.empty { opacity: 0.6; font-size: 0.9rem; }
</style>
