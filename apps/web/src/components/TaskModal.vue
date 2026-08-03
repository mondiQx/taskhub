<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Task, TaskPriority } from "../types";
import { useTaskStore } from "../stores/taskStore";

const props = defineProps<{ task: Task | null; mode: "create" | "edit"; initialTitle?: string }>();
const emit = defineEmits<{
  close: [];
  create: [
    payload: {
      title: string;
      body: string;
      priority: TaskPriority;
      due: string | null;
      tags: string[];
      relatedMeeting: { eventId: string; title: string; start: string } | null;
    },
  ];
  complete: [id: string];
  reopen: [id: string];
  linkMeeting: [id: string, meeting: { eventId: string; title: string; start: string } | null];
  setDue: [id: string, due: string | null];
  setTags: [id: string, tags: string[]];
  setPriority: [id: string, priority: TaskPriority];
  setTitle: [id: string, title: string];
  setBody: [id: string, body: string];
  delete: [id: string];
}>();

const taskStore = useTaskStore();
const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

const draftTitle = ref("");
const draftBody = ref("");
const draftPriority = ref<TaskPriority>("medium");
const draftDue = ref("");
const draftTags = ref<string[]>([]);
const draftMeeting = ref<{ eventId: string; title: string; start: string } | null>(null);

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

watch(
  () => props.initialTitle,
  (title) => {
    if (props.mode === "create" && title) draftTitle.value = title;
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
async function loadEvents() {
  const [liveRes, vaultRes] = await Promise.all([fetch("/api/calendar/events"), fetch("/api/meetings")]);
  const [live, vault]: [CalendarEvent[], CalendarEvent[]] = [await liveRes.json(), await vaultRes.json()];
  events.value = [...vault, ...live].sort((a, b) => b.start.localeCompare(a.start));
}
if (props.mode === "create") loadEvents();
watch(
  () => props.task?.id,
  (id) => {
    if (!id || props.mode !== "edit") return;
    loadEvents();
  },
  { immediate: true },
);

function onSelectMeeting(e: Event) {
  const eventId = (e.target as HTMLSelectElement).value;
  const event = eventId ? events.value.find((ev) => ev.id === eventId) : undefined;
  const meeting = event ? { eventId: event.id, title: event.title, start: event.start } : null;
  if (props.mode === "create") {
    draftMeeting.value = meeting;
    return;
  }
  if (!props.task) return;
  emit("linkMeeting", props.task.id, meeting);
}

const HOLD_MS = 3000;
const holding = ref(false);
let holdTimer: number | undefined;

function startHold() {
  if (!props.task || holding.value) return;
  holding.value = true;
  holdTimer = window.setTimeout(() => {
    holding.value = false;
    if (props.task) emit("delete", props.task.id);
  }, HOLD_MS);
}
function cancelHold() {
  holding.value = false;
  if (holdTimer !== undefined) {
    clearTimeout(holdTimer);
    holdTimer = undefined;
  }
}

function submitCreate() {
  if (!draftTitle.value.trim()) return;
  emit("create", {
    title: draftTitle.value.trim(),
    body: draftBody.value.trim(),
    priority: draftPriority.value,
    due: draftDue.value ? new Date(`${draftDue.value}T00:00:00`).toISOString() : null,
    tags: draftTags.value,
    relatedMeeting: draftMeeting.value,
  });
  draftTitle.value = "";
  draftBody.value = "";
  draftPriority.value = "medium";
  draftDue.value = "";
  draftTags.value = [];
  draftMeeting.value = null;
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
          <div class="due-row">
            <input type="date" :value="mode === 'create' ? draftDue : dueInputValue(task?.due ?? null)" @change="onDueChange" />
            <button v-if="mode === 'edit' && task?.due" class="clear-due" @click="emit('setDue', task!.id, null)">Clear</button>
          </div>
        </div>
      </div>

      <template v-if="mode === 'create'">
        <h3>Discuss in meeting</h3>
        <select class="meeting-select" :value="draftMeeting?.eventId ?? ''" @change="onSelectMeeting">
          <option value="">Not linked to a meeting</option>
          <option v-for="event in events" :key="event.id" :value="event.id" :title="`${event.title} — ${new Date(event.start).toLocaleString()}`">
            {{ event.title }} — {{ new Date(event.start).toLocaleString() }}
          </option>
        </select>
        <p v-if="!events.length" class="hint">No meetings found (nothing cached in vault/meetings, and Calendar not connected or nothing upcoming in the next 24h).</p>
      </template>

      <template v-if="mode === 'edit' && task">
        <div class="actions">
          <button v-if="task.status !== 'done'" @click="emit('complete', task.id)">Mark done</button>
          <button v-else @click="emit('reopen', task.id)">Reopen</button>
        </div>

        <h3>Discuss in meeting</h3>
        <select class="meeting-select" :value="task.relatedMeeting?.eventId ?? ''" @change="onSelectMeeting">
          <option value="">Not linked to a meeting</option>
          <option v-for="event in events" :key="event.id" :value="event.id" :title="`${event.title} — ${new Date(event.start).toLocaleString()}`">
            {{ event.title }} — {{ new Date(event.start).toLocaleString() }}
          </option>
        </select>
        <p v-if="!events.length" class="hint">No meetings found (nothing cached in vault/meetings, and Calendar not connected or nothing upcoming in the next 24h).</p>

        <h3>History</h3>
        <ul class="history">
          <li v-for="(h, i) in task.history" :key="i">
            <strong>{{ h.event }}</strong> — {{ new Date(h.at).toLocaleString() }}
            <span v-if="h.note">— {{ h.note }}</span>
          </li>
        </ul>

        <p class="source">Source: {{ task.source.type }} <a v-if="task.source.url" :href="task.source.url" target="_blank">open</a></p>

        <div class="danger-zone">
          <div class="danger-text">
            <p class="danger-label">Delete task</p>
            <p class="danger-hint">This can't be undone — the task file is removed from the vault.</p>
          </div>
          <button
            type="button"
            class="delete-hold"
            :class="{ holding }"
            title="Hold for 3 seconds to delete this task"
            aria-label="Hold to delete task"
            @pointerdown="startHold"
            @pointerup="cancelHold"
            @pointerleave="cancelHold"
            @pointercancel="cancelHold"
            @keydown.enter.prevent="startHold"
            @keydown.space.prevent="startHold"
            @keyup.enter="cancelHold"
            @keyup.space="cancelHold"
          >
            <span class="delete-hold-fill" :style="{ transitionDuration: holding ? `${HOLD_MS}ms` : '0ms' }"></span>
            <span class="delete-hold-label">{{ holding ? "Keep holding…" : "Hold to delete" }}</span>
          </button>
        </div>
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
  background: rgba(var(--shadow-tint), 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: var(--space-4);
}
.panel {
  position: relative;
  background: var(--drawer-bg, var(--color-surface));
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-5);
  width: clamp(420px, 38vw, 720px);
  max-width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}
.close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-3);
  border: none;
  background: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-ink-soft);
  border-radius: 999px;
  width: 2rem;
  height: 2rem;
  transition: background 140ms var(--ease), color 140ms var(--ease);
}
.close:hover { background: rgba(var(--shadow-tint), 0.08); color: var(--color-ink); }
h2 { margin: 0 0 var(--space-3); padding-right: var(--space-5); font-weight: 600; letter-spacing: -0.01em; }
h3 { font-weight: 600; font-size: 0.95rem; letter-spacing: -0.005em; }
.title-input {
  font-size: clamp(1.15rem, 0.9rem + 0.6vw, 1.5rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  border: none;
  border-bottom: 1px solid transparent;
  width: 100%;
  box-sizing: border-box;
  padding: 0.1rem 0;
  background: none;
  font-family: inherit;
  text-overflow: ellipsis;
  transition: border-color 140ms var(--ease);
}
.title-input:focus { outline: none; border-bottom-color: var(--color-accent); }
.create-title { font-size: 1rem; font-weight: 500; border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: var(--space-2); margin-bottom: var(--space-3); }
.create-title:focus { outline: none; border-color: var(--color-accent); }
.tags { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: var(--space-2) 0; align-items: center; }
.tag { background: rgba(var(--shadow-tint), 0.08); border-radius: 999px; padding: 0.1rem 0.4rem 0.1rem 0.5rem; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.2rem; }
.tag-remove { border: none; background: none; cursor: pointer; font-size: 0.8rem; line-height: 1; padding: 0; opacity: 0.6; transition: opacity 120ms var(--ease); }
.tag-remove:hover { opacity: 1; }
.tag-input-wrap { position: relative; display: inline-block; }
.tag-input { border: 1px dashed rgba(var(--shadow-tint), 0.3); background: none; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.75rem; width: 70px; transition: border-color 120ms var(--ease); }
.tag-input:focus { outline: none; border-color: var(--color-accent); border-style: solid; }
.tag-suggestions {
  position: absolute; top: 100%; left: 0; margin-top: var(--space-1); z-index: 10;
  list-style: none; padding: var(--space-1) 0; margin-inline-start: 0;
  background: var(--drawer-bg, var(--color-surface)); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md); min-width: 100px;
}
.tag-suggestions li { padding: 0.3rem 0.6rem; font-size: 0.8rem; cursor: pointer; transition: background 100ms var(--ease); }
.tag-suggestions li.highlighted, .tag-suggestions li:hover { background: rgba(var(--shadow-tint), 0.08); }
.body-input {
  width: 100%;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  resize: vertical;
  box-sizing: border-box;
  margin: var(--space-1) 0 var(--space-3);
  transition: border-color 140ms var(--ease);
  min-height: clamp(120px, 22vh, 320px);
}
.body-input:focus { outline: none; border-color: var(--color-accent); }
.row { display: flex; gap: var(--space-4); margin-bottom: var(--space-2); }
.field { display: flex; flex-direction: column; gap: var(--space-1); font-size: 0.8rem; }
.field select, .field input[type="date"] { padding: 0.35rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); font: inherit; transition: border-color 140ms var(--ease); }
.field select:focus, .field input[type="date"]:focus { outline: none; border-color: var(--color-accent); }
.due-row { display: flex; align-items: center; gap: var(--space-1); }
.meeting-select {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0.35rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color 140ms var(--ease);
}
.meeting-select:focus { outline: none; border-color: var(--color-accent); }
.clear-due { font-size: 0.7rem; padding: 0.15rem 0.4rem; cursor: pointer; flex-shrink: 0; }
.actions { margin: var(--space-3) 0; }
.actions button {
  background: var(--color-ink); color: white; border: none; border-radius: var(--radius-sm);
  padding: 0.5rem var(--space-4); cursor: pointer; font: inherit;
  transition: background 140ms var(--ease), transform 120ms var(--ease);
}
.actions button:hover { background: var(--color-ink-soft); }
.actions button:active { transform: scale(0.97); }
.history { list-style: none; padding: 0; font-size: 0.8rem; opacity: 0.85; }
.history li { margin-bottom: var(--space-1); }
.source { font-size: 0.8rem; opacity: 0.7; }
.hint { font-size: 0.75rem; opacity: 0.6; }
.danger-zone {
  margin-top: var(--space-5);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.danger-text { flex: 1; min-width: 0; }
.danger-label { font-size: 0.8rem; font-weight: 600; color: #b3261e; margin: 0 0 0.15rem; }
.danger-hint { font-size: 0.75rem; opacity: 0.6; margin: 0; }
.delete-hold {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 0.5rem var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(179, 38, 30, 0.35);
  background: rgba(179, 38, 30, 0.06);
  color: #b3261e;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: background 140ms var(--ease), border-color 140ms var(--ease);
}
.delete-hold:hover { background: rgba(179, 38, 30, 0.12); }
.delete-hold:focus-visible { outline: 2px solid #b3261e; outline-offset: 2px; }
.delete-hold-fill {
  position: absolute;
  inset: 0;
  width: 0%;
  background: #b3261e;
  transition-property: width;
  transition-timing-function: linear;
}
.delete-hold.holding .delete-hold-fill { width: 100%; }
.delete-hold.holding { color: white; border-color: #b3261e; }
.delete-hold-label { position: relative; z-index: 1; }
.create-actions { margin-top: var(--space-4); display: flex; justify-content: flex-end; }
.submit {
  background: var(--color-accent); color: white; border: none; border-radius: var(--radius-sm);
  padding: 0.5rem var(--space-4); cursor: pointer; font: inherit; font-weight: 500;
  transition: background 140ms var(--ease), transform 120ms var(--ease);
}
.submit:hover { background: #a8552d; }
.submit:active { transform: scale(0.97); }
</style>
