<script setup lang="ts">
import type { Task } from "../types";

const props = defineProps<{ task: Task }>();
const emit = defineEmits<{ complete: [id: string]; reopen: [id: string]; open: [id: string] }>();

const colors = ["#fff59d", "#ffccbc", "#c8e6c9", "#b3e5fc", "#e1bee7"];
function colorFor(id: string) {
  const hash = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
</script>

<template>
  <div
    class="note"
    :style="{ background: colorFor(task.id) }"
    :class="{ done: task.status === 'done' }"
    @click="emit('open', task.id)"
  >
    <label @click.stop>
      <input
        type="checkbox"
        :checked="task.status === 'done'"
        @change="task.status === 'done' ? emit('reopen', task.id) : emit('complete', task.id)"
      />
    </label>
    <p>{{ task.title }}</p>
  </div>
</template>

<style scoped>
.note {
  aspect-ratio: 1;
  padding: 0.75rem;
  border-radius: 4px;
  box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.15);
  transform: rotate(-1deg);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.note:nth-child(even) { transform: rotate(1deg); }
.note.done { opacity: 0.5; text-decoration: line-through; }
.note p { font-size: 0.9rem; font-weight: 600; word-break: break-word; }
</style>
