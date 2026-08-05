<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Task } from "../types";
import { useTaskStore } from "../stores/taskStore";

const props = defineProps<{ task: Task | null }>();
const emit = defineEmits<{
  close: [];
  complete: [id: string];
  reopen: [id: string];
  linkMeeting: [id: string, meeting: { eventId: string; title: string; start: string } | null];
  setDue: [id: string, due: string | null];
  setTags: [id: string, tags: string[]];
}>();

function dueInputValue(due: string | null): string {
  if (!due) return "";
  const d = new Date(due);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function onDueChange(e: Event) {
  if (!props.task) return;
  const value = (e.target as HTMLInputElement).value;
  emit("setDue", props.task.id, value ? new Date(`${value}T00:00:00`).toISOString() : null);
}

const taskStore = useTaskStore();
const tagDraft = ref("");
const showSuggestions = ref(false);
const highlightedIndex = ref(0);

const allTags = computed(() => {
  const set = new Set<string>();
  for (const t of taskStore.tasks) for (const tag of t.tags) set.add(tag);
  return [...set].sort();
});

const suggestions = computed(() => {
  const query = tagDraft.value.trim().toLowerCase();
  const existing = props.task?.tags ?? [];
  return allTags.value
    .filter((tag) => tag.includes(query) && !existing.includes(tag))
    .slice(0, 6);
});

function removeTag(tag: string) {
  if (!props.task) return;
  emit("setTags", props.task.id, props.task.tags.filter((t) => t !== tag));
}

function commitTag(value: string) {
  if (!props.task) return;
  const tag = value.trim().toLowerCase();
  tagDraft.value = "";
  showSuggestions.value = false;
  if (!tag || props.task.tags.includes(tag)) return;
  emit("setTags", props.task.id, [...props.task.tags, tag]);
}

function addTag() {
  commitTag(tagDraft.value);
}

function selectSuggestion(tag: string) {
  commitTag(tag);
}

function onTagInput() {
  showSuggestions.value = true;
  highlightedIndex.value = 0;
}

function onTagKeydown(e: KeyboardEvent) {
  if (!showSuggestions.value || !suggestions.value.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlightedIndex.value = (highlightedIndex.value + 1) % suggestions.value.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlightedIndex.value = (highlightedIndex.value - 1 + suggestions.value.length) % suggestions.value.length;
  } else if (e.key === "Escape") {
    showSuggestions.value = false;
  }
}

function onTagEnter() {
  if (showSuggestions.value && suggestions.value.length) {
    commitTag(suggestions.value[highlightedIndex.value]);
  } else {
    addTag();
  }
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
}

const events = ref<CalendarEvent[]>([]);

watch(
  () => props.task?.id,
  async (id) => {
    if (!id) return;
    const res = await fetch("/api/calendar/events");
    events.value = await res.json();
  },
  { immediate: true },
);

function onSelectMeeting(e: Event) {
  if (!props.task) return;
  const eventId = (e.target as HTMLSelectElement).value;
  if (!eventId) {
    emit("linkMeeting", props.task.id, null);
    return;
  }
  const event = events.value.find((ev) => ev.id === eventId);
  if (event) emit("linkMeeting", props.task.id, { eventId: event.id, title: event.title, start: event.start });
}
</script>

<template>
  <aside v-if="task" class="drawer">
    <button class="close" @click="emit('close')">×</button>
    <h2>{{ task.title }}</h2>
    <div class="tags">
      <span v-for="tag in task.tags" :key="tag" class="tag">
        {{ tag }}
        <button class="tag-remove" @click="removeTag(tag)">×</button>
      </span>
      <div class="tag-input-wrap">
        <input
          v-model="tagDraft"
          type="text"
          class="tag-input"
          placeholder="+ tag"
          @input="onTagInput"
          @focus="onTagInput"
          @keydown="onTagKeydown"
          @keydown.enter.prevent="onTagEnter"
          @blur="showSuggestions = false; addTag()"
        />
        <ul v-if="showSuggestions && suggestions.length" class="tag-suggestions">
          <li
            v-for="(tag, i) in suggestions"
            :key="tag"
            :class="{ highlighted: i === highlightedIndex }"
            @mousedown.prevent="selectSuggestion(tag)"
          >
            {{ tag }}
          </li>
        </ul>
      </div>
    </div>
    <p class="body">{{ task.body }}</p>

    <div class="actions">
      <button v-if="task.status !== 'done'" @click="emit('complete', task.id)">Mark done</button>
      <button v-else @click="emit('reopen', task.id)">Reopen</button>
    </div>

    <h3>Due date</h3>
    <input type="date" :value="dueInputValue(task.due)" @change="onDueChange" />
    <button v-if="task.due" class="clear-due" @click="emit('setDue', task.id, null)">Clear</button>

    <h3>Discuss in meeting</h3>
    <select :value="task.relatedMeeting?.eventId ?? ''" @change="onSelectMeeting">
      <option value="">Not linked to a meeting</option>
      <option v-for="event in events" :key="event.id" :value="event.id">
        {{ event.title }} — {{ new Date(event.start).toLocaleString() }}
      </option>
    </select>
    <p v-if="!events.length" class="hint">No upcoming events (Calendar not connected yet, or nothing in the next 24h).</p>

    <h3>History</h3>
    <ul class="history">
      <li v-for="(h, i) in task.history" :key="i">
        <strong>{{ h.event }}</strong> — {{ new Date(h.at).toLocaleString() }}
        <span v-if="h.note">— {{ h.note }}</span>
      </li>
    </ul>

    <p class="source">Source: {{ task.source.type }} <a v-if="task.source.url" :href="task.source.url" target="_blank">open</a></p>
  </aside>
</template>

<style scoped>
.drawer {
  position: fixed; top: 0; right: 0; height: 100vh; width: 320px;
  background: var(--drawer-bg, #fff); box-shadow: -2px 0 8px rgba(0,0,0,0.15);
  padding: 1.25rem; overflow-y: auto;
}
.close { position: absolute; top: 0.5rem; right: 0.75rem; border: none; background: none; font-size: 1.5rem; cursor: pointer; }
.tags { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0.5rem 0; align-items: center; }
.tag { background: rgba(0,0,0,0.08); border-radius: 999px; padding: 0.1rem 0.4rem 0.1rem 0.5rem; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.2rem; }
.tag-remove { border: none; background: none; cursor: pointer; font-size: 0.8rem; line-height: 1; padding: 0; opacity: 0.6; }
.tag-remove:hover { opacity: 1; }
.tag-input-wrap { position: relative; display: inline-block; }
.tag-input { border: 1px dashed rgba(0,0,0,0.25); background: none; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.75rem; width: 70px; }
.tag-suggestions {
  position: absolute; top: 100%; left: 0; margin-top: 0.25rem; z-index: 10;
  list-style: none; padding: 0.25rem 0; margin-inline-start: 0;
  background: var(--drawer-bg, #fff); border: 1px solid rgba(0,0,0,0.15); border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15); min-width: 100px;
}
.tag-suggestions li { padding: 0.3rem 0.6rem; font-size: 0.8rem; cursor: pointer; }
.tag-suggestions li.highlighted, .tag-suggestions li:hover { background: rgba(0,0,0,0.08); }
.body { white-space: pre-wrap; font-size: 0.9rem; }
.actions { margin: 1rem 0; }
.history { list-style: none; padding: 0; font-size: 0.8rem; opacity: 0.85; }
.history li { margin-bottom: 0.35rem; }
.source { font-size: 0.8rem; opacity: 0.7; }
select { width: 100%; padding: 0.4rem; margin-bottom: 0.25rem; }
input[type="date"] { padding: 0.35rem; margin-right: 0.5rem; }
.clear-due { font-size: 0.75rem; padding: 0.2rem 0.5rem; }
.hint { font-size: 0.75rem; opacity: 0.6; }
</style>
