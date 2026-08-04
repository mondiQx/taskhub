<script setup lang="ts">
import { toRef } from "vue";
import type { Task } from "../types";
import { useTaskAging } from "../composables/useTaskAging";

const props = defineProps<{ task: Task }>();
const emit = defineEmits<{ complete: [id: string]; reopen: [id: string]; open: [id: string] }>();

const { dueInDays, isOverdue, procrastinationDays } = useTaskAging(toRef(props, "task"));

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData("text/plain", props.task.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
</script>

<template>
  <div
    class="task-card"
    :class="[`priority-${task.priority}`, { done: task.status === 'done' }]"
    draggable="true"
    @dragstart="onDragStart"
    @click="emit('open', task.id)"
  >
    <label class="checkbox" @click.stop>
      <input
        type="checkbox"
        :checked="task.status === 'done'"
        @change="task.status === 'done' ? emit('reopen', task.id) : emit('complete', task.id)"
      />
    </label>
    <div class="body">
      <div class="title">
        <span v-if="task.seenAt === null" class="new-badge">NEW</span>
        {{ task.title }}
      </div>
      <div class="meta">
        <span class="source">{{ task.source.type }}</span>
        <span v-if="task.due" class="due" :class="{ overdue: isOverdue }">
          {{ isOverdue ? `${Math.abs(dueInDays!)}d overdue` : `due in ${dueInDays}d` }}
        </span>
        <span v-else class="age">{{ procrastinationDays }}d old</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-card {
  display: flex;
  gap: var(--space-2);
  padding: 0.6rem var(--space-3);
  border-radius: var(--radius-md);
  background: var(--card-bg, var(--color-surface));
  border-left: 4px solid var(--accent, #e0c341);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 140ms var(--ease), box-shadow 140ms var(--ease);
}
.task-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.task-card:active { transform: translateY(0); box-shadow: var(--shadow-sm); }
.priority-urgent { border-left-color: #e5484d; }
.priority-high { border-left-color: #f5a524; }
.priority-medium { border-left-color: #e0c341; }
.priority-low { border-left-color: #8da4ad; }
.done { opacity: 0.55; text-decoration: line-through; }
.body { flex: 1; min-width: 0; }
.title { font-weight: 600; font-size: 0.9rem; word-break: break-word; }
.new-badge {
  display: inline-block;
  background: #e5484d;
  color: white;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
  margin-right: 0.35rem;
  vertical-align: middle;
  transform: translateY(-1px);
}
.meta { display: flex; gap: var(--space-2); font-size: 0.75rem; opacity: 0.75; margin-top: var(--space-1); }
.due.overdue { color: #e5484d; font-weight: 600; }
</style>
