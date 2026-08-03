import { defineStore } from "pinia";
import type { ReviewItem } from "../types";

interface State {
  items: ReviewItem[];
  loaded: boolean;
}

export const useReviewQueueStore = defineStore("reviewQueue", {
  state: (): State => ({ items: [], loaded: false }),

  actions: {
    async init() {
      if (this.loaded) return;
      const res = await fetch("/api/review-queue");
      this.items = await res.json();
      this.loaded = true;
    },

    // Called by taskStore's single websocket connection when a "review"/"review-snapshot" message arrives.
    applySnapshot(items: ReviewItem[]) {
      this.items = items;
      this.loaded = true;
    },

    applyChange(event: { type: "removed" | "reset"; id?: string; items?: ReviewItem[] }) {
      if (event.type === "removed" && event.id) {
        this.items = this.items.filter((i) => i.id !== event.id);
      } else if (event.type === "reset" && event.items) {
        this.items = event.items;
      }
    },

    async promote(id: string) {
      this.items = this.items.filter((i) => i.id !== id);
      await fetch(`/api/review-queue/${id}/promote`, { method: "POST" });
    },

    async dismiss(id: string) {
      this.items = this.items.filter((i) => i.id !== id);
      await fetch(`/api/review-queue/${id}/dismiss`, { method: "POST" });
    },
  },
});
