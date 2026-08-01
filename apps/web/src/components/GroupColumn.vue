<script setup lang="ts">
import { ref } from "vue";
import type { Task } from "../types";
import TaskCard from "./TaskCard.vue";

defineProps<{ label: string; tasks: Task[]; columnKey: string }>();
const emit = defineEmits<{
  complete: [id: string];
  reopen: [id: string];
  open: [id: string];
  drop: [taskId: string, columnKey: string];
}>();

const dragOver = ref(false);

function onDrop(e: DragEvent, columnKey: string) {
  dragOver.value = false;
  const taskId = e.dataTransfer?.getData("text/plain");
  if (taskId) emit("drop", taskId, columnKey);
}
</script>

<template>
  <div
    class="column"
    :class="{ 'drag-over': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop($event, columnKey)"
  >
    <div class="column-header">
      <span>{{ label }}</span>
      <span class="count">{{ tasks.length }}</span>
    </div>
    <div class="column-body">
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @complete="emit('complete', $event)"
        @reopen="emit('reopen', $event)"
        @open="emit('open', $event)"
      />
      <p v-if="!tasks.length" class="empty">Nothing here.</p>
    </div>
  </div>
</template>

<style scoped>
.column { display: flex; flex-direction: column; min-width: 220px; flex: 1; height: 100%; min-height: 0; border-radius: 8px; transition: background 0.15s; }
.column.drag-over { background: rgba(0,0,0,0.05); outline: 2px dashed rgba(0,0,0,0.2); }
.column-header {
  position: sticky; top: 0; z-index: 1;
  display: flex; justify-content: space-between; align-items: center;
  font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 0.4rem 0.25rem; opacity: 0.8;
  background: var(--column-header-bg, #f5f0e1);
  flex-shrink: 0;
}
.count { background: rgba(0,0,0,0.08); border-radius: 999px; padding: 0 0.5rem; font-size: 0.75rem; }
.column-body { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 0.5rem; }
.empty { font-size: 0.8rem; opacity: 0.5; padding: 0.5rem; }
</style>
