import { Router } from "express";
import { taskRepository } from "../vault/taskRepository.js";
import { calendarCache } from "../reminders/calendarCache.js";
import { buildVaultGraph, readVaultFile, resolveVaultId } from "../vault/graph.js";
import { listVaultMeetings } from "../vault/meetingsRepository.js";
import type { NewTaskInput } from "../types.js";

export const router = Router();

router.get("/calendar/events", (_req, res) => {
  res.json(calendarCache.list());
});

router.get("/meetings", async (_req, res) => {
  res.json(await listVaultMeetings());
});

router.get("/graph", async (_req, res) => {
  res.json(await buildVaultGraph());
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
