<script setup lang="ts">
import { useTasks } from "../composables/useTasks";
import TaskCard from "../components/TaskCard.vue";

const emit = defineEmits<{ open: [id: string] }>();
const { store, openTasks } = useTasks();
</script>

<template>
  <div class="list">
    <TaskCard
      v-for="task in openTasks"
      :key="task.id"
      :task="task"
      @complete="store.complete"
      @reopen="store.reopen"
      @open="emit('open', $event)"
    />
  </div>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; max-width: 640px; margin: 0 auto; }
</style>
