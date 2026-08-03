<script setup lang="ts">
defineProps<{
  title: string;
  note?: string;
  minutesUntil?: number;
}>();
const emit = defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div class="overlay">
    <div class="modal">
      <span class="ring-icon">⏰</span>
      <p class="heading">{{ minutesUntil != null ? `Meeting in ${minutesUntil} min` : "Meeting starting" }}</p>
      <h2>{{ title }}</h2>
      <p v-if="note" class="note">{{ note }}</p>
      <button class="dismiss" @click="emit('dismiss')">Dismiss</button>
    </div>
  </div>
</template>

<style scoped>
/* No @click.self dismiss on the overlay, unlike other modals — this one is
   deliberately alarm-clock-strict: it only goes away via the button. */
.overlay {
  position: fixed; inset: 0; background: rgba(47, 42, 36, 0.55);
  display: flex; align-items: center; justify-content: center; z-index: 100; padding: var(--space-4);
}
.modal {
  background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  width: min(420px, 100%); padding: var(--space-6) var(--space-5); text-align: center;
  border: 2px solid var(--color-accent);
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: var(--shadow-lg); }
  50% { box-shadow: 0 0 0 8px rgba(193, 103, 58, 0.18), var(--shadow-lg); }
}
.ring-icon { font-size: 2.5rem; display: block; }
.heading {
  margin: var(--space-2) 0 0; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.02em;
  text-transform: uppercase; color: var(--color-accent);
}
h2 { margin: var(--space-2) 0 0; font-size: 1.2rem; line-height: 1.3; }
.note { margin: var(--space-3) 0 0; font-size: 0.9rem; color: var(--color-ink-soft); }
.dismiss {
  margin-top: var(--space-5); background: var(--color-accent); color: white; border: none;
  border-radius: var(--radius-md); padding: var(--space-3) var(--space-6); font: inherit; font-weight: 600;
  font-size: 1rem; cursor: pointer;
}
.dismiss:hover { opacity: 0.9; }
</style>
