<script setup lang="ts">
import { onMounted } from "vue";
import { useReviewQueueStore } from "../stores/reviewQueueStore";

const store = useReviewQueueStore();

onMounted(() => store.init());
</script>

<template>
  <div class="review-queue">
    <p v-if="!store.items.length" class="empty">Nothing waiting for review.</p>
    <ul v-else class="items">
      <li v-for="item in store.items" :key="item.id" class="item">
        <div class="body">
          <div class="subject">{{ item.subject }}</div>
          <div class="reason">{{ item.reason }}</div>
          <div class="meta" v-if="item.kind === 'gmail'">from: {{ item.from }}</div>
          <div class="meta" v-else>
            → {{ item.targetNoteId ? item.targetNoteId : "no matching note found" }}
          </div>
        </div>
        <div class="actions">
          <button
            class="promote"
            :disabled="item.kind === 'note-excerpt' && !item.targetNoteId"
            @click="store.promote(item.id)"
          >
            {{ item.kind === "gmail" ? "Create task" : "Apply to note" }}
          </button>
          <button class="dismiss" @click="store.dismiss(item.id)">Dismiss</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.review-queue { max-width: 720px; margin: 0 auto; padding: var(--space-5); }
.empty { color: var(--color-ink-soft); text-align: center; margin-top: var(--space-6); }
.items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.item {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: var(--space-4); box-shadow: var(--shadow-sm);
}
.subject { font-weight: 600; }
.reason { color: var(--color-ink-soft); font-size: 0.9rem; margin-top: var(--space-1); }
.meta { color: var(--color-ink-soft); font-size: 0.78rem; margin-top: var(--space-2); opacity: 0.8; }
.actions { display: flex; flex-direction: column; gap: var(--space-2); flex-shrink: 0; }
.actions button {
  font: inherit; font-size: 0.85rem; padding: 0.35rem var(--space-3); border-radius: var(--radius-sm);
  border: 1px solid var(--color-border); cursor: pointer; white-space: nowrap;
}
.promote { background: var(--color-accent); color: white; border-color: var(--color-accent); }
.dismiss { background: none; color: var(--color-ink-soft); }
</style>
