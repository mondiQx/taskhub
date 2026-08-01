<script setup lang="ts">
import { ref } from "vue";
import { useTasks } from "../composables/useTasks";
import { useVoiceCapture } from "../composables/useVoiceCapture";
import { FOLDED_TIME_BUCKETS } from "../composables/useGrouping";
import PostItSection from "../components/PostItSection.vue";

const emit = defineEmits<{ open: [id: string] }>();
const { store, byTimePeriod, byCategory } = useTasks();

const groupBy = ref<"time" | "category">("time");
const draft = ref("");

async function addNote() {
  if (!draft.value.trim()) return;
  await store.createTask({ title: draft.value.trim(), source: { type: "manual", externalId: null, url: null } });
  draft.value = "";
}

const voice = useVoiceCapture((transcript) => {
  store.createTask({ title: transcript, source: { type: "voice", externalId: null, url: null } });
});
</script>

<template>
  <div class="postits">
    <form class="quick-capture" @submit.prevent="addNote">
      <input v-model="draft" type="text" placeholder="Quick note or task..." />
      <button type="submit">+ Add</button>
      <button
        v-if="voice.supported"
        type="button"
        class="mic"
        :class="{ recording: voice.recording }"
        @click="voice.recording ? voice.stop() : voice.start()"
      >
        {{ voice.recording ? "● Stop" : "🎤" }}
      </button>
      <select v-model="groupBy" class="group-select">
        <option value="time">Group by time</option>
        <option value="category">Group by category</option>
      </select>
    </form>
    <p v-if="voice.interimTranscript" class="interim">{{ voice.interimTranscript }}</p>

    <PostItSection
      v-for="col in (groupBy === 'time' ? byTimePeriod : byCategory)"
      :key="col.key"
      :label="col.label"
      :tasks="col.tasks"
      :default-collapsed="groupBy === 'time' && FOLDED_TIME_BUCKETS.has(col.key as any)"
      @complete="store.complete"
      @reopen="store.reopen"
      @open="emit('open', $event)"
    />
  </div>
</template>

<style scoped>
.postits { padding: 1rem; }
.quick-capture { display: flex; gap: 0.5rem; margin-bottom: 0.25rem; }
.quick-capture input { flex: 1; padding: 0.5rem; border-radius: 6px; border: 1px solid #ccc; }
.mic.recording { background: #e5484d; color: white; }
.group-select { padding: 0.4rem; border-radius: 6px; border: 1px solid #ccc; }
.interim { font-size: 0.8rem; opacity: 0.6; margin: 0.25rem 0 0.75rem; }
</style>
