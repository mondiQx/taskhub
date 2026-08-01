<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { marked } from "marked";

const props = defineProps<{ folder: string; id: string }>();
const emit = defineEmits<{ close: []; "open-task": [taskId: string]; "open-note": [folder: string, id: string] }>();

const title = ref("");
const body = ref("");
const loading = ref(true);
const error = ref(false);

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
  width: 560px;
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
.folder-tag { font-size: 0.7rem; text-transform: uppercase; opacity: 0.5; margin: 0 0 0.15rem; letter-spacing: 0.05em; }
h2 { margin: 0 0 0.75rem; padding-right: 1.5rem; }
.hint { font-size: 0.85rem; opacity: 0.6; }
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) { margin: 1rem 0 0.4rem; }
.markdown-body :deep(p) { margin: 0.5rem 0; line-height: 1.5; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) { padding-inline-start: 1.25rem; }
.markdown-body :deep(li) { margin: 0.2rem 0; line-height: 1.45; }
.markdown-body :deep(a) { color: #2f6fbf; }
.markdown-body :deep(code) { background: rgba(0, 0, 0, 0.06); padding: 0.05rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
.markdown-body :deep(pre) { background: rgba(0, 0, 0, 0.06); padding: 0.6rem; border-radius: 6px; overflow-x: auto; }
</style>
