<script setup lang="ts">
import type { Task } from "../types";
import { colorForId } from "../utils/noteColor";

const props = defineProps<{ task: Task; draggable?: boolean }>();
const emit = defineEmits<{ complete: [id: string]; reopen: [id: string]; open: [id: string] }>();

const colorFor = colorForId;

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData("text/plain", props.task.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
</script>

<template>
  <div
    class="note"
    :style="{ background: colorFor(task.id) }"
    :class="{ done: task.status === 'done' }"
    :draggable="draggable"
    @dragstart="draggable && onDragStart($event)"
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
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  box-shadow: 2px 3px 8px rgba(var(--shadow-tint), 0.2);
  transform: rotate(-1deg);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: transform 160ms var(--ease), box-shadow 160ms var(--ease);
}
.note:nth-child(even) { transform: rotate(1deg); }
.note:hover { transform: rotate(0deg) translateY(-2px); box-shadow: 3px 6px 14px rgba(var(--shadow-tint), 0.28); }
.note:active { transform: rotate(0deg) translateY(0); }
.note.done { opacity: 0.5; text-decoration: line-through; }
.note p { font-size: 0.9rem; font-weight: 600; word-break: break-word; }
</style>
