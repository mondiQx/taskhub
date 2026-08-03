import { defineStore } from "pinia";

export type MorningStatus = "running" | "done" | "error" | "stopped";

export interface MorningRun {
  id: string;
  status: MorningStatus;
  startedAt: string;
  finishedAt: string | null;
  log: string[];
  error: string | null;
}

interface State {
  history: MorningRun[];
  loaded: boolean;
}

export const useAutomationStore = defineStore("automation", {
  state: (): State => ({ history: [], loaded: false }),

  getters: {
    current(state): MorningRun | null {
      return state.history[0] ?? null;
    },
  },

  actions: {
    async init() {
      if (this.loaded) return;
      const res = await fetch("/api/morning/history");
      this.history = await res.json();
      this.loaded = true;
    },

    // Called by taskStore's single websocket connection when a "morning" message arrives.
    applyRun(run: MorningRun) {
      const idx = this.history.findIndex((r) => r.id === run.id);
      if (idx >= 0) this.history[idx] = run;
      else this.history.unshift(run);
    },

    async run() {
      if (this.current?.status === "running") return;
      const res = await fetch("/api/morning/run", { method: "POST" });
      this.applyRun(await res.json());
    },

    async stop() {
      const res = await fetch("/api/morning/stop", { method: "POST" });
      const run = await res.json();
      if (run) this.applyRun(run);
    },
  },
});
