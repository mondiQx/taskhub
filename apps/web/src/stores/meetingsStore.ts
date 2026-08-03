import { defineStore } from "pinia";
import type { Meeting } from "../types";
import { computeRecurringSeries, computeUpcomingItems, type SeriesGroup, type UpcomingItem } from "../utils/upcomingMeetings";

interface State {
  meetings: Meeting[];
  loaded: boolean;
}

export const useMeetingsStore = defineStore("meetings", {
  state: (): State => ({ meetings: [], loaded: false }),

  actions: {
    async init() {
      if (this.loaded) return; // shared across views — fetch once
      const res = await fetch("/api/meetings/full");
      this.meetings = await res.json();
      this.loaded = true;
    },
  },

  getters: {
    recurringSeries(state): SeriesGroup[] {
      return computeRecurringSeries(state.meetings);
    },
    // Getter-returning-function so each consumer can pick its own lookahead
    // window (the full Meetings view wants ~2 weeks, a compact strip wants
    // just the next few days).
    upcomingItems(state) {
      return (lookaheadDays: number): UpcomingItem[] => computeUpcomingItems(state.meetings, lookaheadDays);
    },
  },
});
