import { defineStore } from "pinia";

export type JournalAnalysisStatus = "running" | "done" | "error" | "stopped";

export interface JournalAnalysisRun {
  id: string;
  date: string;
  status: JournalAnalysisStatus;
  startedAt: string;
  finishedAt: string | null;
  log: string[];
  error: string | null;
}

interface State {
  history: JournalAnalysisRun[];
  loaded: boolean;
}

export const useJournalAnalysisStore = defineStore("journalAnalysis", {
  state: (): State => ({ history: [], loaded: false }),

  getters: {
    current(state): JournalAnalysisRun | null {
      return state.history[0] ?? null;
    },
    runFor: (state) => (date: string): JournalAnalysisRun | null => state.history.find((r) => r.date === date) ?? null,
  },

  actions: {
    async init() {
      if (this.loaded) return;
      const res = await fetch("/api/journal/analyze/history");
      this.history = await res.json();
      this.loaded = true;
    },

    // Called by taskStore's single websocket connection when a "journal-analysis" message arrives.
    applyRun(run: JournalAnalysisRun) {
      const idx = this.history.findIndex((r) => r.id === run.id);
      if (idx >= 0) this.history[idx] = run;
      else this.history.unshift(run);
    },

    async run(date: string) {
      if (this.current?.status === "running") return;
      const res = await fetch("/api/journal/analyze/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      this.applyRun(await res.json());
    },

    async stop() {
      const res = await fetch("/api/journal/analyze/stop", { method: "POST" });
      const run = await res.json();
      if (run) this.applyRun(run);
    },
  },
});
