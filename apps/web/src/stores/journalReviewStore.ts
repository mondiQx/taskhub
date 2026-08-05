import { defineStore } from "pinia";
import type { JournalReviewItem } from "../types";

interface State {
  items: JournalReviewItem[];
  loaded: boolean;
}

export const useJournalReviewStore = defineStore("journalReview", {
  state: (): State => ({ items: [], loaded: false }),

  actions: {
    async init() {
      if (this.loaded) return;
      const res = await fetch("/api/journal-review");
      this.items = await res.json();
      this.loaded = true;
    },

    // Called by taskStore's single websocket connection when a "journal-review"/"journal-review-snapshot" message arrives.
    applySnapshot(items: JournalReviewItem[]) {
      this.items = items;
      this.loaded = true;
    },

    applyChange(event: { type: "removed" | "reset"; id?: string; items?: JournalReviewItem[] }) {
      if (event.type === "removed" && event.id) {
        this.items = this.items.filter((i) => i.id !== event.id);
      } else if (event.type === "reset" && event.items) {
        this.items = event.items;
      }
    },

    async confirm(id: string) {
      this.items = this.items.filter((i) => i.id !== id);
      await fetch(`/api/journal-review/${id}/confirm`, { method: "POST" });
    },

    async reject(id: string) {
      this.items = this.items.filter((i) => i.id !== id);
      await fetch(`/api/journal-review/${id}/reject`, { method: "POST" });
    },
  },
});
