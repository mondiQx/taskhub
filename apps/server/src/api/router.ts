import { Router } from "express";
import { taskRepository } from "../vault/taskRepository.js";
import { calendarCache } from "../reminders/calendarCache.js";
import { buildVaultGraph, readVaultFile, resolveVaultId } from "../vault/graph.js";
import { searchVault } from "../vault/search.js";
import { listVaultMeetings, listVaultMeetingsFull } from "../vault/meetingsRepository.js";
import { getHistory, startMorningRun, stopMorningRun } from "../automation/morningRun.js";
import {
  getJournalAnalysisHistory,
  startJournalAnalysisRun,
  stopJournalAnalysisRun,
} from "../automation/journalAnalysisRun.js";
import { reviewQueueRepository } from "../vault/reviewQueue.js";
import { journalReviewRepository } from "../vault/journalReview.js";
import { appendJournalEntry, listJournalEntries } from "../vault/journalRepository.js";
import { cleanVoiceTranscript } from "../automation/voiceCleanup.js";
import type { NewTaskInput } from "../types.js";

export const router = Router();

router.get("/morning/history", (_req, res) => {
  res.json(getHistory());
});

router.post("/morning/run", (_req, res) => {
  const run = startMorningRun();
  res.status(run.status === "running" ? 202 : 200).json(run);
});

router.post("/morning/stop", (_req, res) => {
  res.json(stopMorningRun());
});

router.get("/calendar/events", (_req, res) => {
  res.json(calendarCache.list());
});

router.get("/meetings", async (_req, res) => {
  res.json(await listVaultMeetings());
});

router.get("/meetings/full", async (_req, res) => {
  res.json(await listVaultMeetingsFull());
});

router.get("/graph", async (_req, res) => {
  res.json(await buildVaultGraph());
});

/** Local, offline fuzzy/typo-tolerant lexical search over the whole vault — no embeddings, no network calls. */
router.get("/vault/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q.trim()) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  res.json(await searchVault(q));
});

router.get("/vault/resolve/:id", async (req, res) => {
  const resolved = await resolveVaultId(req.params.id);
  if (!resolved) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(resolved);
});

router.get("/vault/:folder/:id", async (req, res) => {
  const file = await readVaultFile(req.params.folder, req.params.id);
  if (!file) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(file);
});

router.get("/tasks", (_req, res) => {
  res.json(taskRepository.list());
});

router.post("/tasks", async (req, res) => {
  const input = req.body as NewTaskInput;
  if (!input?.title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const task = await taskRepository.create(input);
  res.status(201).json(task);
});

router.patch("/tasks/:id", async (req, res) => {
  try {
    const task = await taskRepository.update(req.params.id, req.body, { event: "updated" });
    res.json(task);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.post("/tasks/:id/seen", async (req, res) => {
  try {
    const task = await taskRepository.markSeen(req.params.id);
    res.json(task);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    await taskRepository.delete(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.post("/tasks/:id/complete", async (req, res) => {
  try {
    const task = await taskRepository.complete(req.params.id);
    res.json(task);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.post("/tasks/:id/reopen", async (req, res) => {
  try {
    const task = await taskRepository.reopen(req.params.id, req.body?.note);
    res.json(task);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

/** Ingestion endpoint used by connectors (calendar/slack) — dedups by source.type + source.externalId. */
router.post("/ingest", async (req, res) => {
  const input = req.body as NewTaskInput;
  if (!input?.source?.externalId) {
    res.status(400).json({ error: "source.externalId is required for ingested tasks" });
    return;
  }
  const existing = taskRepository.findBySourceExternalId(input.source.type, input.source.externalId);
  if (existing) {
    const task = await taskRepository.update(existing.id, { title: input.title, body: input.body ?? existing.body });
    res.json(task);
    return;
  }
  const task = await taskRepository.create(input);
  res.status(201).json(task);
});

router.get("/review-queue", async (_req, res) => {
  res.json(await reviewQueueRepository.list());
});

router.post("/review-queue/:id/promote", async (req, res) => {
  try {
    await reviewQueueRepository.promote(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.post("/review-queue/:id/dismiss", async (req, res) => {
  try {
    await reviewQueueRepository.dismiss(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.get("/journal/analyze/history", (_req, res) => {
  res.json(getJournalAnalysisHistory());
});

router.post("/journal/analyze/run", (req, res) => {
  const { date } = req.body as { date?: string };
  if (!date) {
    res.status(400).json({ error: "date is required" });
    return;
  }
  const run = startJournalAnalysisRun(date);
  res.status(run.status === "running" ? 202 : 200).json(run);
});

router.post("/journal/analyze/stop", (_req, res) => {
  res.json(stopJournalAnalysisRun());
});

router.get("/journal-review", async (_req, res) => {
  res.json(await journalReviewRepository.list());
});

router.post("/journal-review/:id/confirm", async (req, res) => {
  try {
    await journalReviewRepository.confirm(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.post("/journal-review/:id/reject", async (req, res) => {
  try {
    await journalReviewRepository.reject(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.get("/journal", async (_req, res) => {
  res.json(await listJournalEntries());
});

router.post("/journal/clean-transcript", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  try {
    const cleaned = await cleanVoiceTranscript(text);
    res.json({ cleaned });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/journal", async (req, res) => {
  const { text, section } = req.body as { text?: string; section?: "Journal" | "Personal notes" };
  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const entry = await appendJournalEntry(text, section === "Personal notes" ? "Personal notes" : "Journal");
  res.status(201).json(entry);
});

router.post("/voice-note", async (req, res) => {
  const { transcript } = req.body as { transcript?: string };
  if (!transcript?.trim()) {
    res.status(400).json({ error: "transcript is required" });
    return;
  }
  const task = await taskRepository.create({
    title: transcript.slice(0, 80),
    body: transcript,
    source: { type: "voice", externalId: null, url: null },
  });
  res.status(201).json(task);
});
