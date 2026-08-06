<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useMeetingsStore } from "../stores/meetingsStore";
import { useTaskStore } from "../stores/taskStore";

const props = withDefaults(defineProps<{ days?: number }>(), { days: 3 });
const emit = defineEmits<{ "open-meeting": [id: string]; "open-task": [id: string] }>();

const meetingsStore = useMeetingsStore();
const taskStore = useTaskStore();
onMounted(() => meetingsStore.init());

const items = computed(() => meetingsStore.upcomingItems(props.days));

// Tasks the user tagged to a specific meeting occurrence (TaskModal's
// "link meeting" picker writes relatedMeeting.eventId) — surfaced right on
// the card so "what do I need to bring to this" doesn't require a click-through.
function tasksFor(eventId: string | undefined) {
  if (!eventId) return [];
  return taskStore.tasks.filter((t) => t.status !== "archived" && t.relatedMeeting?.eventId === eventId);
}

const dragOverKey = ref<string | null>(null);

function onDrop(e: DragEvent, m: (typeof items.value)[number]) {
  dragOverKey.value = null;
  if (!m.eventId) return;
  const taskId = e.dataTransfer?.getData("text/plain");
  if (!taskId) return;
  taskStore.patch(taskId, {
    relatedMeeting: { eventId: m.eventId, title: m.title, start: m.start, reminderFired: false },
  });
}

const trackEl = ref<HTMLElement | null>(null);
const atStart = ref(true);
const atEnd = ref(false);

function updateEdges() {
  const el = trackEl.value;
  if (!el) return;
  atStart.value = el.scrollLeft <= 4;
  atEnd.value = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4;
}

function scrollByCards(dir: 1 | -1) {
  const el = trackEl.value;
  if (!el) return;
  el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
}
</script>

<template>
  <div v-if="items.length" class="strip">
    <span class="label">Coming up</span>
    <div class="scroller">
      <button
        v-if="!atStart"
        type="button"
        class="nav-btn prev"
        aria-label="Scroll to earlier meetings"
        @click="scrollByCards(-1)"
      >
        ‹
      </button>
      <ul ref="trackEl" class="chips" @scroll="updateEdges">
        <li
          v-for="m in items"
          :key="m.key"
          class="chip"
          :class="{ 'drag-over': dragOverKey === m.key }"
          @click="emit('open-meeting', m.id)"
          @dragover.prevent="m.eventId && (dragOverKey = m.key)"
          @dragleave="dragOverKey = null"
          @drop.prevent="onDrop($event, m)"
        >
          <span class="top-row">
            <span class="relative">{{ m.relative }}</span>
            <span v-if="m.recurring" class="recurring-badge" title="Recurring meeting">↻</span>
          </span>
          <span class="title">{{ m.title }}</span>
          <ul v-if="tasksFor(m.eventId).length" class="tasks">
            <li
              v-for="t in tasksFor(m.eventId)"
              :key="t.id"
              class="task-tag"
              :class="{ done: t.status === 'done' }"
              @click.stop="emit('open-task', t.id)"
            >
              {{ t.title }}
            </li>
          </ul>
        </li>
      </ul>
      <button
        v-if="!atEnd"
        type="button"
        class="nav-btn next"
        aria-label="Scroll to later meetings"
        @click="scrollByCards(1)"
      >
        ›
      </button>
    </div>
  </div>
</template>

<style scoped>
.strip {
  display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.label { font-size: 0.75rem; font-weight: 600; color: var(--color-ink-soft); white-space: nowrap; flex-shrink: 0; }

.scroller { position: relative; min-width: 0; }
.chips {
  list-style: none; margin: 0; padding: var(--space-1); display: flex; gap: var(--space-3);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
}
.chips::-webkit-scrollbar { display: none; }

.chip {
  display: flex; flex-direction: column; gap: 0.35rem; cursor: pointer;
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: 0.6rem 0.75rem; box-shadow: var(--shadow-sm);
  transition: border-color 140ms var(--ease), transform 140ms var(--ease), box-shadow 140ms var(--ease);
  scroll-snap-align: start;
  flex-shrink: 0;
  width: 160px;
}
.chip:hover { border-color: var(--color-accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
.chip.drag-over { border-color: var(--color-accent); border-style: dashed; background: rgba(193, 103, 58, 0.08); }
.top-row { display: flex; align-items: center; justify-content: space-between; gap: 0.3rem; }
.chip .relative { font-weight: 700; font-size: 0.8rem; color: var(--color-accent); }
.chip .title {
  font-size: 0.8rem; line-height: 1.25; color: var(--color-ink);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.recurring-badge { color: var(--color-ink-soft); font-size: 0.9rem; flex-shrink: 0; }

.tasks {
  list-style: none; margin: 0.15rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem;
}
.task-tag {
  font-size: 0.7rem; line-height: 1.2; color: var(--color-ink-soft);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  padding: 0.15rem 0.4rem; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: border-color 140ms var(--ease), color 140ms var(--ease);
}
.task-tag:hover { border-color: var(--color-accent); color: var(--color-accent); }
.task-tag.done { text-decoration: line-through; opacity: 0.55; }

.nav-btn {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 2rem; height: 2rem; border-radius: 50%; z-index: 1;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-ink-soft);
  cursor: pointer; box-shadow: var(--shadow-sm); font-size: 1.3rem; line-height: 1; padding: 0;
  transition: background 140ms var(--ease), color 140ms var(--ease), border-color 140ms var(--ease);
}
.nav-btn:hover { background: var(--color-accent); border-color: var(--color-accent); color: white; }
.nav-btn.prev { left: -0.2rem; }
.nav-btn.next { right: -0.2rem; }

@media (max-width: 640px) {
  .nav-btn { display: none; }
}
</style>
