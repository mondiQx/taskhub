<script setup lang="ts">
import { ref } from "vue";
import type { Task } from "../types";
import PostItNote from "./PostItNote.vue";

const props = defineProps<{ label: string; tasks: Task[]; defaultCollapsed?: boolean }>();
const emit = defineEmits<{ complete: [id: string]; reopen: [id: string]; open: [id: string] }>();

const collapsed = ref(props.defaultCollapsed ?? false);
</script>

<template>
  <section class="section" v-if="tasks.length">
    <button class="section-header" @click="collapsed = !collapsed">
      <span class="chevron" :class="{ collapsed }">▾</span>
      <span class="label">{{ label }}</span>
      <span class="count">{{ tasks.length }}</span>
    </button>

    <div v-if="!collapsed" class="board">
      <PostItNote
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @complete="emit('complete', $event)"
        @reopen="emit('reopen', $event)"
        @open="emit('open', $event)"
      />
    </div>
    <button v-else class="folder" @click="collapsed = false">
      <span class="folder-icon">🗂️</span>
      <span>{{ tasks.length }} note{{ tasks.length === 1 ? "" : "s" }} — click to expand</span>
    </button>
  </section>
</template>

<style scoped>
.section { margin-bottom: 1.25rem; }
.section-header {
  display: flex; align-items: center; gap: 0.5rem;
  background: none; border: none; cursor: pointer; padding: 0.25rem 0;
  font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em;
  opacity: 0.8; width: 100%; text-align: left;
}
.chevron { transition: transform 0.15s; display: inline-block; }
.chevron.collapsed { transform: rotate(-90deg); }
.label { flex: 0 0 auto; }
.count { background: rgba(0,0,0,0.08); border-radius: 999px; padding: 0 0.5rem; font-size: 0.75rem; }
.board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
  margin-top: 0.75rem;
}
.folder {
  display: flex; align-items: center; gap: 0.5rem;
  margin-top: 0.5rem; padding: 0.75rem 1rem;
  background: rgba(0,0,0,0.05); border: 1px dashed rgba(0,0,0,0.2); border-radius: 8px;
  cursor: pointer; font-size: 0.85rem; opacity: 0.8; width: 100%;
}
.folder:hover { background: rgba(0,0,0,0.08); }
.folder-icon { font-size: 1.2rem; }
</style>
