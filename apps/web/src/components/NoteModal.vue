<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { marked } from "marked";
import { useJournalReviewStore } from "../stores/journalReviewStore";
import { useJournalAnalysisStore } from "../stores/journalAnalysisStore";

const props = defineProps<{ folder: string; id: string }>();
const emit = defineEmits<{ close: []; "open-task": [taskId: string]; "open-note": [folder: string, id: string] }>();

const journalReview = useJournalReviewStore();
const analysis = useJournalAnalysisStore();
const showAnalysisLog = ref(false);

const isJournal = computed(() => props.folder === "journal");
const pendingItems = computed(() => journalReview.items.filter((i) => i.date === props.id));
const run = computed(() => analysis.runFor(props.id));

function kindLabel(payload: Record<string, unknown>): string {
  return (
    { "new-task": "New task", "task-update": "Update task", "meeting-recap": "Meeting recap", bug: "Bug" }[
      payload.kind as string
    ] ?? String(payload.kind ?? "")
  );
}

function runAnalysis() {
  showAnalysisLog.value = true;
  analysis.run(props.id);
}

onMounted(() => journalReview.init());
onMounted(() => analysis.init());

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
      <div v-if="isJournal" class="journal-analysis">
        <div class="analysis-bar">
          <button class="analyze-btn" :disabled="run?.status === 'running'" @click="runAnalysis">
            {{ run?.status === "running" ? "Analyzing…" : "Analyze this entry" }}
          </button>
          <button v-if="run" class="log-toggle" @click="showAnalysisLog = !showAnalysisLog">
            {{ showAnalysisLog ? "Hide log" : "Show log" }}
          </button>
        </div>

        <div v-if="showAnalysisLog && run" class="analysis-log">
          <p v-for="(line, i) in run.log" :key="i">{{ line }}</p>
          <p v-if="!run.log.length && run.status === 'running'" class="hint">Starting…</p>
          <p v-if="run.error" class="analysis-error">{{ run.error }}</p>
        </div>

        <div v-if="pendingItems.length" class="review-section">
          <h3 class="review-heading">Pending from journal analysis</h3>
          <ul class="review-items">
            <li v-for="item in pendingItems" :key="item.id" class="review-item">
              <div class="review-body">
                <span class="review-kind">{{ kindLabel(item.payload) }}</span>
                <div class="review-desc">{{ item.description }}</div>
                <div class="review-target">target: {{ item.targetLabel }}</div>
              </div>
              <div class="review-actions">
                <button class="confirm" @click="journalReview.confirm(item.id)">Confirm</button>
                <button class="reject" @click="journalReview.reject(item.id)">Reject</button>
              </div>
            </li>
          </ul>
        </div>
      </div>

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

.journal-analysis { margin: 0 0 var(--space-4); }
.analysis-bar { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); flex-wrap: wrap; }
.analyze-btn {
  background: var(--color-ink); color: white; border: none; border-radius: var(--radius-sm);
  padding: 0.5rem 0.9rem; cursor: pointer; font: inherit; font-size: 0.85rem;
}
.analyze-btn:disabled { opacity: 0.6; cursor: default; }
.log-toggle {
  background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  padding: 0.5rem 0.75rem; cursor: pointer; font: inherit; font-size: 0.8rem; color: var(--color-ink-soft);
}
.analysis-log {
  background: rgba(var(--shadow-tint), 0.04); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: var(--space-3); margin-bottom: var(--space-3); font-size: 0.82rem; line-height: 1.5;
  max-height: 220px; overflow-y: auto;
}
.analysis-log p { margin: 0 0 var(--space-2); white-space: pre-wrap; }
.analysis-error { color: #b3402a; }

.review-section { margin-bottom: var(--space-3); }
.review-heading { font-size: 0.8rem; font-weight: 600; opacity: 0.75; margin: 0 0 var(--space-2); }
.review-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.review-item {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3);
  background: rgba(var(--shadow-tint), 0.04); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: var(--space-3);
}
.review-body { min-width: 0; }
.review-kind {
  display: inline-block; font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  opacity: 0.6; margin-bottom: 0.2rem;
}
.review-desc { font-size: 0.88rem; }
.review-target { font-size: 0.76rem; opacity: 0.65; margin-top: var(--space-1); }
.review-actions { display: flex; flex-direction: column; gap: var(--space-2); flex-shrink: 0; }
.review-actions button {
  font: inherit; font-size: 0.82rem; padding: 0.3rem var(--space-3); border-radius: var(--radius-sm);
  border: 1px solid var(--color-border); cursor: pointer; white-space: nowrap;
}
.confirm { background: var(--color-accent); color: white; border-color: var(--color-accent); }
.reject { background: none; color: var(--color-ink-soft); }

@media (max-width: 560px) {
  .review-item { flex-direction: column; }
  .review-actions { flex-direction: row; width: 100%; }
  .review-actions button { flex: 1; }
}
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
