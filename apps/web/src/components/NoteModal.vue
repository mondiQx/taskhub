<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { marked } from "marked";

const props = defineProps<{ folder: string; id: string }>();
const emit = defineEmits<{ close: []; "open-task": [taskId: string]; "open-note": [folder: string, id: string] }>();

const title = ref("");
const body = ref("");
const date = ref<string | undefined>(undefined);
const start = ref<string | undefined>(undefined);
const end = ref<string | undefined>(undefined);
const recurs = ref<string | undefined>(undefined);
const url = ref<string | undefined>(undefined);
const meetLink = ref<string | undefined>(undefined);
const loading = ref(true);
const error = ref(false);

const hasTimeOfDay = (iso: string) => /T\d{2}:\d{2}/.test(iso);

const dateLabel = computed(() => {
  if (!date.value) return "";
  const d = new Date(date.value);
  const dateStr = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  if (start.value && hasTimeOfDay(start.value)) {
    const startStr = new Date(start.value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (end.value && hasTimeOfDay(end.value)) {
      const endStr = new Date(end.value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      return `${dateStr} · ${startStr}–${endStr}`;
    }
    return `${dateStr} · ${startStr}`;
  }
  return dateStr;
});

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

/** Turns Obsidian [[wikilinks]] into normal markdown links with a custom scheme, so marked renders them as <a> tags we can intercept. */
function linkifyWikilinks(md: string): string {
  return md.replace(WIKILINK, (_match, target: string, alias?: string) => {
    const id = target.trim();
    const label = (alias ?? id).trim();
    return `[${label}](wiki:${encodeURIComponent(id.toLowerCase())})`;
  });
}

const html = computed(() => (body.value ? marked.parse(linkifyWikilinks(body.value), { async: false }) : ""));

async function onBodyClick(evt: MouseEvent) {
  const link = (evt.target as HTMLElement).closest("a");
  if (!link) return;
  const href = link.getAttribute("href") ?? "";
  if (!href.startsWith("wiki:")) return;
  evt.preventDefault();

  const targetId = decodeURIComponent(href.slice("wiki:".length));
  const res = await fetch(`/api/vault/resolve/${targetId}`);
  if (!res.ok) return;
  const resolved = await res.json();
  if (resolved.taskId) emit("open-task", resolved.taskId);
  else emit("open-note", resolved.folder, targetId);
}

watch(
  () => [props.folder, props.id],
  async ([folder, id]) => {
    loading.value = true;
    error.value = false;
    try {
      const res = await fetch(`/api/vault/${folder}/${id}`);
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      title.value = data.title;
      body.value = data.body;
      date.value = data.date;
      start.value = data.start;
      end.value = data.end;
      recurs.value = data.recurs;
      url.value = data.url;
      meetLink.value = data.meetLink;
    } catch {
      error.value = true;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="panel">
      <button class="close" @click="emit('close')">×</button>
      <p class="folder-tag">{{ folder }}</p>
      <h2>{{ title || id }}</h2>
      <p v-if="dateLabel" class="date-label">
        {{ dateLabel }}<span v-if="recurs"> · {{ recurs }}</span>
      </p>
      <a v-if="meetLink" :href="meetLink" target="_blank" rel="noopener noreferrer" class="meeting-link">
        Join on Meet ↗
      </a>
      <a v-else-if="url" :href="url" target="_blank" rel="noopener noreferrer" class="meeting-link">
        Open in Calendar ↗
      </a>
      <p v-if="loading" class="hint">Loading…</p>
      <p v-else-if="error" class="hint">Couldn't load this note.</p>
      <div v-else class="markdown-body" v-html="html" @click="onBodyClick"></div>
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
  width: clamp(560px, 50vw, 920px);
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
.folder-tag { font-size: 0.7rem; text-transform: uppercase; opacity: 0.5; margin: 0 0 0.15rem; letter-spacing: 0.05em; }
h2 { margin: 0 0 var(--space-1); padding-right: var(--space-5); font-weight: 600; letter-spacing: -0.01em; font-size: clamp(1.15rem, 0.9rem + 0.6vw, 1.5rem); }
.date-label { margin: 0 0 var(--space-2); font-size: 0.85rem; opacity: 0.6; }
.meeting-link {
  display: inline-flex; align-items: center; gap: 0.3rem; margin: 0 0 var(--space-3);
  font-size: 0.85rem; font-weight: 600; color: var(--color-accent); text-decoration: none;
  border: 1px solid var(--color-accent); border-radius: var(--radius-sm); padding: 0.3rem 0.7rem;
  transition: background 140ms var(--ease), color 140ms var(--ease);
}
.meeting-link:hover { background: var(--color-accent); color: white; }
.hint { font-size: 0.85rem; opacity: 0.6; }
.markdown-body { font-size: clamp(0.95rem, 0.85rem + 0.2vw, 1.05rem); max-width: 68ch; }
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) { margin: 1rem 0 0.4rem; }
.markdown-body :deep(p) { margin: 0.5rem 0; line-height: 1.6; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) { padding-inline-start: 1.25rem; }
.markdown-body :deep(li) { margin: 0.2rem 0; line-height: 1.5; }
.markdown-body :deep(a) { color: #2f6fbf; }
.markdown-body :deep(code) { background: rgba(var(--shadow-tint), 0.08); padding: 0.05rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
.markdown-body :deep(pre) { background: rgba(var(--shadow-tint), 0.08); padding: 0.6rem; border-radius: var(--radius-sm); overflow-x: auto; }
</style>
