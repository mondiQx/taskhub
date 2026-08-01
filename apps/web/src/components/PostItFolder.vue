<script setup lang="ts">
import { motion } from "motion-v";

defineProps<{ label: string; count: number; expanded?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <motion.button
    class="folder"
    :class="{ expanded }"
    layout
    :while-hover="{ y: -3 }"
    :while-tap="{ scale: 0.96 }"
    :transition="{ type: 'spring', stiffness: 400, damping: 28 }"
    @click="$emit('toggle')"
  >
    <span class="tab"></span>
    <span class="stack">
      <span class="card card-3"></span>
      <span class="card card-2"></span>
      <span class="card card-1"></span>
    </span>
    <p class="label">{{ label }}</p>
    <span class="count">
      <motion.span class="chevron" :animate="{ rotate: expanded ? 180 : 0 }">▾</motion.span>
      {{ count }} note{{ count === 1 ? "" : "s" }}
    </span>
  </motion.button>
</template>

<style scoped>
.folder {
  position: relative;
  aspect-ratio: 1;
  padding: 0.85rem 0.75rem 0.75rem;
  margin-top: 8px;
  border-radius: 3px 8px 8px 8px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  background: #e3d6ab;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.12), 0 4px 10px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font-family: inherit;
}
.tab {
  position: absolute;
  top: -8px;
  left: 10px;
  width: 42%;
  height: 9px;
  background: #e3d6ab;
  border: 1px solid rgba(0, 0, 0, 0.25);
  border-bottom: none;
  border-radius: 5px 5px 0 0;
}
.folder:hover { background: #dccb98; }
.folder:hover .tab { background: #dccb98; }
.folder.expanded { background: #cdb87e; border-color: rgba(0, 0, 0, 0.4); }
.folder.expanded .tab { background: #cdb87e; border-color: rgba(0, 0, 0, 0.4); }
.stack { position: relative; width: 42px; height: 34px; }
.card {
  position: absolute;
  width: 28px;
  height: 22px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.card-3 { top: 8px; left: 8px; background: #b3e5fc; }
.card-2 { top: 4px; left: 4px; background: #c8e6c9; }
.card-1 { top: 0; left: 0; background: #fff59d; }
.label {
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  word-break: break-word;
  margin: 0;
}
.count { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; opacity: 0.75; }
.chevron { display: inline-block; }
</style>
