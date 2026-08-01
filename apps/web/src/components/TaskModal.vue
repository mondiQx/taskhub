<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Task, TaskPriority } from "../types";
import { useTaskStore } from "../stores/taskStore";

const props = defineProps<{ task: Task | null; mode: "create" | "edit" }>();
const emit = defineEmits<{
  close: [];
  create: [payload: { title: string; body: string; priority: TaskPriority; due: string | null; tags: string[] }];
  complete: [id: string];
  reopen: [id: string];
  linkMeeting: [id: string, meeting: { eventId: string; title: string; start: string } | null];
  setDue: [id: string, due: string | null];
  setTags: [id: string, tags: string[]];
  setPriority: [id: string, priority: TaskPriority];
  setTitle: [id: string, title: string];
  setBody: [id: string, body: string];
}>();

const taskStore = useTaskStore();
const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

const draftTitle = ref("");
const draftBody = ref("");
const draftPriority = ref<TaskPriority>("medium");
const draftDue = ref("");
const draftTags = ref<string[]>([]);

const editTitle = ref("");
const editBody = ref("");

watch(
  () => props.task,
  (t) => {
    if (t) {
      editTitle.value = t.title;
      editBody.value = t.body;
    }
  },
  { immediate: true },
);

function dueInputValue(due: string | null): string {
  return due ? due.slice(0, 10) : "";
}

const tagDraft = ref("");
const showSuggestions = ref(false);
const highlightedIndex = ref(0);

const allTags = computed(() => {
  const set = new Set<string>();
  for (const t of taskStore.tasks) for (const tag of t.tags) set.add(tag);
  return [...set].sort();
});

const currentTags = computed(() => (props.mode === "create" ? draftTags.value : props.task?.tags ?? []));

const suggestions = computed(() => {
  const query = tagDraft.value.trim().toLowerCase();
  return allTags.value.filter((tag) => tag.includes(query) && !currentTags.value.includes(tag)).slice(0, 6);
});

function removeTag(tag: string) {
  if (props.mode === "create") {
    draftTags.value = draftTags.value.filter((t) => t !== tag);
  } else if (props.task) {
    emit("setTags", props.task.id, props.task.tags.filter((t) => t !== tag));
  }
}

function commitTag(value: string) {
  const tag = value.trim().toLowerCase();
  tagDraft.value = "";
  showSuggestions.value = false;
  if (!tag || currentTags.value.includes(tag)) return;
  if (props.mode === "create") {
    draftTags.value = [...draftTags.value, tag];
  } else if (props.task) {
    emit("setTags", props.task.id, [...props.task.tags, tag]);
  }
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

function onDueChange(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  if (props.mode === "create") {
    draftDue.value = value;
  } else if (props.task) {
    emit("setDue", props.task.id, value ? new Date(`${value}T00:00:00`).toISOString() : null);
  }
}

function onPriorityChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value as TaskPriority;
  if (props.mode === "create") {
    draftPriority.value = value;
  } else if (props.task) {
    emit("setPriority", props.task.id, value);
  }
}

function onTitleBlur() {
  if (props.mode === "edit" && props.task && editTitle.value.trim() && editTitle.value !== props.task.title) {
    emit("setTitle", props.task.id, editTitle.value.trim());
  }
}
function onBodyBlur() {
  if (props.mode === "edit" && props.task && editBody.value !== props.task.body) {
    emit("setBody", props.task.id, editBody.value);
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
    if (!id || props.mode !== "edit") return;
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

function submitCreate() {
  if (!draftTitle.value.trim()) return;
  emit("create", {
    title: draftTitle.value.trim(),
    body: draftBody.value.trim(),
    priority: draftPriority.value,
    due: draftDue.value ? new Date(`${draftDue.value}T00:00:00`).toISOString() : null,
    tags: draftTags.value,
  });
  draftTitle.value = "";
  draftBody.value = "";
  draftPriority.value = "medium";
  draftDue.value = "";
  draftTags.value = [];
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="panel">
      <button class="close" @click="emit('close')">×</button>
      <h2 v-if="mode === 'edit'">
        <input v-model="editTitle" class="title-input" @blur="onTitleBlur" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      </h2>
      <h2 v-else>New task</h2>

      <input
        v-if="mode === 'create'"
        v-model="draftTitle"
        class="title-input create-title"
        type="text"
        placeholder="What needs doing?"
        @keydown.enter="submitCreate"
      />

      <div class="tags">
        <span v-for="tag in currentTags" :key="tag" class="tag">
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

      <textarea
        v-if="mode === 'create'"
        v-model="draftBody"
        class="body-input"
        placeholder="Details (optional)"
        rows="4"
      ></textarea>
      <textarea v-else v-model="editBody" class="body-input" rows="4" @blur="onBodyBlur"></textarea>

      <div class="row">
        <div class="field">
          <label>Priority</label>
          <select :value="mode === 'create' ? draftPriority : task?.priority" @change="onPriorityChange">
            <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p[0].toUpperCase() + p.slice(1) }}</option>
          </select>
        </div>
        <div class="field">
          <label>Due date</label>
          <input type="date" :value="mode === 'create' ? draftDue : dueInputValue(task?.due ?? null)" @change="onDueChange" />
          <button v-if="mode === 'edit' && task?.due" class="clear-due" @click="emit('setDue', task!.id, null)">Clear</button>
        </div>
      </div>

      <template v-if="mode === 'edit' && task">
        <div class="actions">
          <button v-if="task.status !== 'done'" @click="emit('complete', task.id)">Mark done</button>
          <button v-else @click="emit('reopen', task.id)">Reopen</button>
        </div>

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
      </template>

      <div v-else class="create-actions">
        <button class="submit" @click="submitCreate">Add task</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}
.panel {
  position: relative;
  background: var(--drawer-bg, #fff);
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  padding: 1.5rem;
  width: 420px;
  max-width: 100%;
  max-height: 85vh;
  overflow-y: auto;
}
.close {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  border: none;
  background: none;
  font-size: 1.5rem;
  cursor: pointer;
}
h2 { margin: 0 0 0.75rem; padding-right: 1.5rem; }
.title-input {
  font-size: 1.1rem;
  font-weight: 700;
  border: none;
  border-bottom: 1px solid transparent;
  width: 100%;
  padding: 0.1rem 0;
  background: none;
  font-family: inherit;
}
.title-input:focus { outline: none; border-bottom-color: rgba(0, 0, 0, 0.2); }
.create-title { font-size: 1rem; font-weight: 500; border: 1px solid #ccc; border-radius: 6px; padding: 0.5rem; margin-bottom: 0.75rem; }
.tags { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0.5rem 0; align-items: center; }
.tag { background: rgba(0, 0, 0, 0.08); border-radius: 999px; padding: 0.1rem 0.4rem 0.1rem 0.5rem; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.2rem; }
.tag-remove { border: none; background: none; cursor: pointer; font-size: 0.8rem; line-height: 1; padding: 0; opacity: 0.6; }
.tag-remove:hover { opacity: 1; }
.tag-input-wrap { position: relative; display: inline-block; }
.tag-input { border: 1px dashed rgba(0, 0, 0, 0.25); background: none; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.75rem; width: 70px; }
.tag-suggestions {
  position: absolute; top: 100%; left: 0; margin-top: 0.25rem; z-index: 10;
  list-style: none; padding: 0.25rem 0; margin-inline-start: 0;
  background: var(--drawer-bg, #fff); border: 1px solid rgba(0, 0, 0, 0.15); border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); min-width: 100px;
}
.tag-suggestions li { padding: 0.3rem 0.6rem; font-size: 0.8rem; cursor: pointer; }
.tag-suggestions li.highlighted, .tag-suggestions li:hover { background: rgba(0, 0, 0, 0.08); }
.body-input { width: 100%; font: inherit; padding: 0.5rem; border-radius: 6px; border: 1px solid #ccc; resize: vertical; box-sizing: border-box; margin: 0.25rem 0 0.75rem; }
.row { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
.field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; }
.field select, .field input[type="date"] { padding: 0.35rem; border-radius: 6px; border: 1px solid #ccc; }
.clear-due { font-size: 0.7rem; padding: 0.15rem 0.4rem; margin-top: 0.15rem; align-self: flex-start; }
.actions { margin: 0.75rem 0; }
.history { list-style: none; padding: 0; font-size: 0.8rem; opacity: 0.85; }
.history li { margin-bottom: 0.35rem; }
.source { font-size: 0.8rem; opacity: 0.7; }
.hint { font-size: 0.75rem; opacity: 0.6; }
.create-actions { margin-top: 1rem; display: flex; justify-content: flex-end; }
.submit { background: #2f2a24; color: white; border: none; border-radius: 6px; padding: 0.5rem 1rem; cursor: pointer; }
</style>
