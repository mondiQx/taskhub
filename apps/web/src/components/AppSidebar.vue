<script setup lang="ts">
type ViewMode = "postit" | "kanban" | "graph" | "meetings" | "review" | "history";

const props = defineProps<{
  open: boolean;
  view: ViewMode;
  groupBy: "priority" | "time";
  postItGroupBy: "time" | "category";
  reviewCount: number;
  notificationsGranted: boolean;
}>();
const emit = defineEmits<{
  close: [];
  "update:view": [ViewMode];
  "update:groupBy": ["priority" | "time"];
  "update:postItGroupBy": ["time" | "category"];
  "request-notifications": [];
}>();

function select(view: ViewMode) {
  emit("update:view", view);
}
</script>

<template>
  <Transition name="fade">
    <div v-if="open" class="backdrop" @click="emit('close')" />
  </Transition>
  <aside class="sidebar" :class="{ open }">
    <div class="sidebar-header">
      <span>Menu</span>
      <button class="close-btn" @click="emit('close')" aria-label="Close menu">✕</button>
    </div>

    <div class="group">
      <p class="group-label">Views</p>
      <button class="item" :class="{ active: view === 'postit' }" @click="select('postit')">Post-its</button>
      <select
        v-if="view === 'postit'"
        class="sub-select"
        :value="postItGroupBy"
        @change="emit('update:postItGroupBy', ($event.target as HTMLSelectElement).value as 'time' | 'category')"
      >
        <option value="time">By time period</option>
        <option value="category">By category</option>
      </select>
      <button class="item" :class="{ active: view === 'kanban' }" @click="select('kanban')">Kanban</button>
      <select
        v-if="view === 'kanban'"
        class="sub-select"
        :value="groupBy"
        @change="emit('update:groupBy', ($event.target as HTMLSelectElement).value as 'priority' | 'time')"
      >
        <option value="time">By time period</option>
        <option value="priority">By priority</option>
      </select>
      <button class="item" :class="{ active: view === 'graph' }" @click="select('graph')">Graph</button>
      <button class="item" :class="{ active: view === 'meetings' }" @click="select('meetings')">Meetings</button>
    </div>

    <div class="group">
      <p class="group-label">Logs</p>
      <button class="item" :class="{ active: view === 'review' }" @click="select('review')">
        Review<span v-if="reviewCount" class="badge">{{ reviewCount }}</span>
      </button>
      <button class="item" :class="{ active: view === 'history' }" @click="select('history')">History</button>
    </div>

    <div class="sidebar-footer">
      <button v-if="!notificationsGranted" class="item" @click="emit('request-notifications')">
        Enable reminders
      </button>
    </div>
  </aside>
</template>

<style scoped>
.backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 20;
}
.fade-enter-active, .fade-leave-active { transition: opacity 160ms var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.sidebar {
  position: fixed; top: 0; left: 0; height: 100%; width: 240px; max-width: 80vw;
  background: var(--color-ink); color: white; z-index: 21;
  display: flex; flex-direction: column; gap: var(--space-4);
  padding: var(--space-4);
  box-shadow: var(--shadow-lg);
  transform: translateX(-100%);
  transition: transform 200ms var(--ease);
  overflow-y: auto;
}
.sidebar.open { transform: translateX(0); }

.sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 600; font-size: 0.85rem; opacity: 0.8;
}
.close-btn {
  background: none; border: none; color: white; font-size: 1rem; cursor: pointer;
  padding: 0.2rem 0.5rem; border-radius: var(--radius-sm);
}
.close-btn:hover { background: rgba(255, 255, 255, 0.12); }

.group { display: flex; flex-direction: column; gap: var(--space-1); }
.group-label {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.55;
  margin: 0 0 var(--space-1); padding: 0 var(--space-1);
}
.item {
  display: flex; align-items: center; gap: var(--space-1);
  background: none; border: 1px solid transparent; color: white; text-align: left;
  padding: 0.5rem var(--space-2); border-radius: var(--radius-sm); cursor: pointer;
  font: inherit; font-size: 0.9rem;
  transition: background 160ms var(--ease), border-color 160ms var(--ease);
}
.item:hover { background: rgba(255, 255, 255, 0.1); }
.item.active { background: var(--color-accent); border-color: var(--color-accent); }
.badge {
  display: inline-block; background: rgba(255, 255, 255, 0.25); color: white;
  border-radius: 999px; font-size: 0.7rem; padding: 0 0.4em; min-width: 1.2em; text-align: center;
}
.sub-select {
  font: inherit; font-size: 0.82rem; background: rgba(255, 255, 255, 0.08); color: white;
  border: 1px solid rgba(255, 255, 255, 0.28); border-radius: var(--radius-sm);
  padding: 0.35rem var(--space-2); margin: 0 0 0 var(--space-2);
}
.sidebar-footer { margin-top: auto; display: flex; flex-direction: column; gap: var(--space-1); }

@media (max-width: 480px) {
  .sidebar { width: 82vw; }
}

/* On wide screens the sidebar lives in-flow next to <main> (pushing it, not
   covering it) and never needs a backdrop — only narrower/mobile layouts get
   the fixed overlay drawer. */
@media (min-width: 768px) {
  .backdrop { display: none; }
  .sidebar {
    position: static;
    height: auto;
    max-width: none;
    width: 240px;
    flex-shrink: 0;
    transform: none;
    box-shadow: none;
    border-right: 1px solid rgba(255, 255, 255, 0.12);
    transition: width 200ms var(--ease), padding 200ms var(--ease), border-color 200ms var(--ease);
  }
  .sidebar:not(.open) {
    width: 0;
    padding-left: 0;
    padding-right: 0;
    border-color: transparent;
    overflow: hidden;
  }
}
</style>
