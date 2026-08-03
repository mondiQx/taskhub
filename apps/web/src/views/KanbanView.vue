<script setup lang="ts">
import { useTasks } from "../composables/useTasks";
import GroupColumn from "../components/GroupColumn.vue";
import UpcomingMeetingsStrip from "../components/UpcomingMeetingsStrip.vue";
import { suggestedDueDateForBucket, type TimeBucket } from "../composables/useGrouping";
import type { TaskPriority } from "../types";

const props = defineProps<{ groupBy: "priority" | "time" }>();
const emit = defineEmits<{ open: [id: string]; "open-meeting": [id: string] }>();

const { store, byPriority, byTimePeriod } = useTasks();

function onDrop(taskId: string, columnKey: string) {
  if (props.groupBy === "priority") {
    store.patch(taskId, { priority: columnKey as TaskPriority });
  } else {
    store.patch(taskId, { due: suggestedDueDateForBucket(columnKey as TimeBucket) });
  }
}
</script>

<template>
  <div class="kanban">
    <UpcomingMeetingsStrip @open-meeting="emit('open-meeting', $event)" @open-task="emit('open', $event)" />
    <div class="board">
      <GroupColumn
        v-for="col in (props.groupBy === 'priority' ? byPriority : byTimePeriod)"
        :key="col.key"
        :column-key="col.key"
        :label="col.label"
        :tasks="col.tasks"
        @complete="store.complete"
        @reopen="store.reopen"
        @open="emit('open', $event)"
        @drop="onDrop"
      />
    </div>
  </div>
</template>

<style scoped>
.kanban { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.board { display: flex; gap: 1rem; padding: 1rem; overflow-x: auto; flex: 1; min-height: 0; }
</style>
