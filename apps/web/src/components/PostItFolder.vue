<script setup lang="ts">
import { ref } from "vue";
import { motion } from "motion-v";

const props = defineProps<{
  label: string;
  count: number;
  newCount?: number;
  previews?: string[];
  expanded?: boolean;
  dropTarget?: boolean;
}>();
const emit = defineEmits<{ toggle: []; drop: [taskId: string] }>();

const SLOTS = 4;
const dragOver = ref(false);

function onDrop(e: DragEvent) {
  dragOver.value = false;
  if (!props.dropTarget) return;
  const taskId = e.dataTransfer?.getData("text/plain");
  if (taskId) emit("drop", taskId);
}
</script>

<template>
  <motion.button
    class="folder"
    :class="{ expanded, 'drag-over': dragOver }"
    layout
    :while-hover="{ scale: 1.04 }"
    :while-tap="{ scale: 0.95 }"
    :transition="{ type: 'spring', stiffness: 420, damping: 30 }"
    @click="$emit('toggle')"
    @dragover.prevent="dropTarget && (dragOver = true)"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <span class="tile">
      <span v-for="i in SLOTS" :key="i" class="chip" :style="{ background: previews?.[i - 1] ?? 'rgba(var(--shadow-tint), 0.12)' }" />
      <span class="badge">{{ count }}</span>
      <span v-if="newCount" class="new-badge" :title="`${newCount} new since you last looked`">{{ newCount }}</span>
    </span>
    <p class="label">{{ label }}</p>
  </motion.button>
</template>

<style scoped>
.folder {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0.4rem;
  font-family: inherit;
}
.tile {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 22%;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.15)), rgba(var(--shadow-tint), 0.09);
  border: 1px solid rgba(var(--shadow-tint), 0.14);
  box-shadow: var(--shadow-sm);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 8%;
  padding: 12%;
  box-sizing: border-box;
  transition: box-shadow 160ms var(--ease), border-color 160ms var(--ease);
}
.folder:hover .tile { box-shadow: var(--shadow-md); }
.folder.expanded .tile {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(193, 103, 58, 0.25), var(--shadow-md);
}
.folder.drag-over .tile {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(193, 103, 58, 0.35), var(--shadow-md);
}
.chip {
  border-radius: 28%;
  box-shadow: 0 1px 2px rgba(var(--shadow-tint), 0.18) inset;
}
.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--color-accent);
  color: white;
  font-size: 0.68rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}
.new-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: #e5484d;
  color: white;
  font-size: 0.68rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}
.label {
  font-size: 0.78rem;
  font-weight: 500;
  text-align: center;
  word-break: break-word;
  margin: 0;
  color: var(--color-ink);
  line-height: 1.25;
}
</style>
