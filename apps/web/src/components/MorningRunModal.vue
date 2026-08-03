<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useAutomationStore } from "../stores/automationStore";

defineEmits<{ close: [] }>();
const automation = useAutomationStore();

const viewingId = ref<string | null>(automation.current?.id ?? null);
const run = computed(() => automation.history.find((r) => r.id === viewingId.value) ?? automation.current);

// Jump the view to whichever run just started.
watch(
  () => automation.current?.id,
  (id) => {
    if (id) viewingId.value = id;
  }
);

const logEl = ref<HTMLElement | null>(null);
watch(
  () => run.value?.log.length,
  async () => {
    await nextTick();
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
  }
);

const STATUS_ICON: Record<string, string> = { running: "●", done: "✓", error: "✕", stopped: "■" };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <header>
        <h2>Start my day</h2>
        <button class="close" @click="$emit('close')">×</button>
      </header>

      <div class="layout">
        <aside class="history">
          <h3>Runs</h3>
          <button
            v-for="r in automation.history"
            :key="r.id"
            class="history-item"
            :class="[r.status, { active: r.id === viewingId }]"
            @click="viewingId = r.id"
          >
            <span class="dot">{{ STATUS_ICON[r.status] }}</span>
            <span class="time">{{ fmtTime(r.startedAt) }}</span>
          </button>
          <p v-if="!automation.history.length" class="empty">No runs yet.</p>
        </aside>

        <section class="live">
          <div class="log" ref="logEl">
            <p v-if="!run" class="empty">Click "Start my day" to run your morning routine now.</p>
            <template v-else>
              <p v-for="(line, i) in run.log" :key="i">{{ line }}</p>
              <p v-if="!run.log.length && run.status === 'running'" class="empty">Starting…</p>
              <p v-if="run.error" class="error">{{ run.error }}</p>
            </template>
          </div>
          <footer>
            <span class="state" :class="run?.status">{{ run?.status ?? "" }}</span>
            <button v-if="run?.status === 'running'" class="stop" @click="automation.stop()">Stop</button>
          </footer>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(47, 42, 36, 0.4);
  display: flex; align-items: center; justify-content: center; z-index: 50; padding: var(--space-4);
}
.modal {
  background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  width: min(720px, 100%); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden;
}
header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-4); border-bottom: 1px solid var(--color-border);
}
header h2 { margin: 0; font-size: 1rem; }
.close { background: none; border: none; font-size: 1.4rem; line-height: 1; cursor: pointer; color: var(--color-ink-soft); }

.layout { display: flex; min-height: 0; flex: 1; }

.history {
  width: 140px; flex-shrink: 0; border-right: 1px solid var(--color-border);
  padding: var(--space-3); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-1);
}
.history h3 { margin: 0 0 var(--space-2); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-ink-soft); }
.history-item {
  display: flex; align-items: center; gap: var(--space-2); background: none; border: none; cursor: pointer;
  padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); font: inherit; font-size: 0.8rem; color: var(--color-ink);
  text-align: left;
}
.history-item:hover { background: rgba(47, 42, 36, 0.06); }
.history-item.active { background: rgba(193, 103, 58, 0.16); }
.history-item .dot { font-size: 0.6rem; }
.history-item.running .dot { color: #c1673a; }
.history-item.done .dot { color: #4a8f4a; }
.history-item.error .dot { color: #b3402a; }
.history-item.stopped .dot { color: var(--color-ink-soft); }
.empty { color: var(--color-ink-soft); font-size: 0.85rem; }

.live { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.log { flex: 1; overflow-y: auto; padding: var(--space-4); font-size: 0.85rem; line-height: 1.5; }
.log p { margin: 0 0 var(--space-3); white-space: pre-wrap; }
.log .error { color: #b3402a; }
footer {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  padding: var(--space-3) var(--space-4); border-top: 1px solid var(--color-border);
}
.state { font-size: 0.8rem; text-transform: capitalize; color: var(--color-ink-soft); }
.state.running { color: #c1673a; }
.state.error { color: #b3402a; }
.stop {
  background: none; border: 1px solid #b3402a; color: #b3402a; border-radius: var(--radius-sm);
  padding: 0.35rem var(--space-3); font: inherit; font-size: 0.85rem; cursor: pointer;
}
.stop:hover { background: rgba(179, 64, 42, 0.08); }
</style>
