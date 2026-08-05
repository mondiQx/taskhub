<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useVoiceCapture } from "../composables/useVoiceCapture";
import { useJournalReviewStore } from "../stores/journalReviewStore";
import type { JournalEntrySummary } from "../types";

const journalReview = useJournalReviewStore();

const emit = defineEmits<{ "open-entry": [date: string] }>();

const DRAFT_KEY = "journal-draft";
const DRAFT_PERSONAL_KEY = "journal-draft-personal";

const entries = ref<JournalEntrySummary[]>([]);
const draft = ref(localStorage.getItem(DRAFT_KEY) ?? "");
const personal = ref(localStorage.getItem(DRAFT_PERSONAL_KEY) === "true");
const saving = ref(false);

watch(draft, (value) => {
  if (value) localStorage.setItem(DRAFT_KEY, value);
  else localStorage.removeItem(DRAFT_KEY);
});
watch(personal, (value) => {
  localStorage.setItem(DRAFT_PERSONAL_KEY, String(value));
});

async function load() {
  const res = await fetch("/api/journal");
  entries.value = await res.json();
}

async function submit() {
  const text = draft.value.trim();
  if (!text || saving.value) return;
  saving.value = true;
  try {
    await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, section: personal.value ? "Personal notes" : "Journal" }),
    });
    draft.value = "";
    personal.value = false;
    localStorage.removeItem(DRAFT_PERSONAL_KEY);
    await load();
  } finally {
    saving.value = false;
  }
}

const voice = useVoiceCapture((transcript) => {
  draft.value = draft.value ? `${draft.value} ${transcript}` : transcript;
});

function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function pendingCount(date: string): number {
  return journalReview.items.filter((i) => i.date === date).length;
}

onMounted(load);
onMounted(() => journalReview.init());
</script>

<template>
  <div class="journal">
    <div class="capture">
      <textarea
        v-model="draft"
        class="draft"
        rows="3"
        placeholder="Dump your thoughts... task updates, meeting recaps, whatever's on your mind."
        @keydown.enter.meta.prevent="submit"
        @keydown.enter.ctrl.prevent="submit"
      />
      <p v-if="voice.interimTranscript" class="interim">{{ voice.interimTranscript }}</p>
      <p v-if="voice.error" class="voice-error">{{ voice.error }}</p>
      <div class="capture-actions">
        <label class="personal-toggle">
          <input type="checkbox" v-model="personal" />
          Personal note
        </label>
        <div class="spacer" />
        <button
          v-if="voice.supported"
          type="button"
          class="mic"
          :class="{ recording: voice.recording }"
          @click="voice.recording ? voice.stop() : voice.start()"
        >
          {{ voice.recording ? "● Stop" : "🎤" }}
        </button>
        <button class="save-btn" :disabled="!draft.trim() || saving" @click="submit">
          {{ saving ? "Saving…" : "Add entry" }}
        </button>
      </div>
    </div>

    <ul class="list">
      <li v-for="entry in entries" :key="entry.date" class="row" @click="emit('open-entry', entry.date)">
        <span class="date">
          {{ dateLabel(entry.date) }}
          <span v-if="pendingCount(entry.date)" class="pending-badge">{{ pendingCount(entry.date) }} pending</span>
        </span>
        <span class="preview">{{ entry.preview || "(empty)" }}</span>
      </li>
      <p v-if="!entries.length" class="empty">No journal entries yet — dump your first thought above.</p>
    </ul>
  </div>
</template>

<style scoped>
.journal { padding: 1rem; max-width: 720px; margin: 0 auto; }
.capture {
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: var(--space-3); margin-bottom: var(--space-4); box-shadow: var(--shadow-sm);
}
.draft {
  width: 100%; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  padding: 0.6rem; font: inherit; resize: vertical; background: var(--color-bg);
}
.draft:focus { outline: 2px solid var(--color-accent); outline-offset: 1px; }
.interim { font-size: 0.8rem; opacity: 0.6; margin: 0.3rem 0 0; }
.voice-error { font-size: 0.8rem; color: #b3261e; margin: 0.3rem 0 0; }
.capture-actions { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); }
.spacer { flex: 1; }
.personal-toggle { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; opacity: 0.8; cursor: pointer; }
.mic {
  border: 1px solid var(--color-border); background: var(--color-surface); border-radius: var(--radius-sm);
  padding: 0.5rem 0.75rem; cursor: pointer; font: inherit;
}
.mic.recording { background: #e5484d; color: white; border-color: #e5484d; }
.save-btn {
  background: var(--color-ink); color: white; border: none; border-radius: var(--radius-sm);
  padding: 0.5rem 0.9rem; cursor: pointer; font: inherit; white-space: nowrap;
}
.save-btn:disabled { opacity: 0.5; cursor: default; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.row {
  display: flex; flex-direction: column; gap: 0.15rem; padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface);
  cursor: pointer; transition: background 140ms var(--ease);
}
.row:hover { background: rgba(var(--shadow-tint), 0.05); }
.date { font-size: 0.8rem; font-weight: 600; opacity: 0.8; display: flex; align-items: center; gap: 0.5rem; }
.pending-badge {
  font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;
  color: var(--color-accent); background: rgba(193, 103, 58, 0.14); border-radius: 999px; padding: 0.1rem 0.5rem;
}
.preview { font-size: 0.85rem; opacity: 0.65; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { opacity: 0.6; font-size: 0.9rem; }
</style>