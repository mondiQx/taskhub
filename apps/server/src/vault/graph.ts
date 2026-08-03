import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { config } from "../config.js";

const FOLDERS = ["tasks", "notes", "meetings", "journal", "reports"];

// Within vault/notes/, color by frontmatter `type` so people/meeting-hubs/initiative-hubs
// are visually distinct in the graph even though they all share the "notes" folder color.
const NOTE_TYPE_COLORS: Record<string, string> = {
  person: "#b0559e",
  "meeting-hub": "#3d6ba8",
  hub: "#4a7c59",
};
const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g;

export interface GraphNode {
  id: string; // filename without extension, lowercased ("category" for synthetic nodes)
  label: string;
  folder: string;
  taskId?: string; // set for nodes in vault/tasks/, the frontmatter task id (not the filename)
  color?: string; // overrides the folder's default color, e.g. urgency gradient on Kanban time buckets
  status?: string; // task status (open/in-progress/done/archived), set for nodes in vault/tasks/
}

export interface GraphEdge {
  source: string;
  target: string;
}

interface RawFile {
  id: string;
  folder: string;
  fm: Record<string, unknown>;
  linkTargets: string[];
}

/** Recursively lists markdown files under dir, returning paths relative to dir (so subfolder notes, e.g. reports/monthly/2026-01.md, are found too). */
async function listMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(sub: string) {
    let entries;
    try {
      entries = await fs.readdir(path.join(dir, sub), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(rel);
      else if (entry.name.endsWith(".md")) out.push(rel);
    }
  }
  await walk("");
  return out;
}

export const VAULT_FOLDERS = FOLDERS;

/** Reads a vault file by folder + lowercased id (as used in graph node ids) — filenames are matched case-insensitively. */
export async function readVaultFile(
  folder: string,
  id: string,
): Promise<
  | {
      title: string;
      body: string;
      date?: string;
      start?: string;
      end?: string;
      recurs?: string;
      url?: string;
      meetLink?: string;
    }
  | undefined
> {
  if (!FOLDERS.includes(folder)) return undefined;
  const dir = path.join(config.vaultPath, folder);
  const file = (await listMarkdownFiles(dir)).find(
    (f) => path.basename(f).replace(/\.md$/, "").toLowerCase() === id.toLowerCase(),
  );
  if (!file) return undefined;
  const raw = await fs.readFile(path.join(dir, file), "utf8");
  const parsed = matter(raw);
  const title = typeof parsed.data.title === "string" ? parsed.data.title : file.replace(/\.md$/, "");
  const date = typeof parsed.data.date === "string" ? parsed.data.date : undefined;
  const start = typeof parsed.data.start === "string" ? parsed.data.start : undefined;
  const end = typeof parsed.data.end === "string" ? parsed.data.end : undefined;
  const recurs = typeof parsed.data.recurs === "string" ? parsed.data.recurs : undefined;
  const url = typeof parsed.data.url === "string" ? parsed.data.url : undefined;
  const meetLink = typeof parsed.data.meetLink === "string" ? parsed.data.meetLink : undefined;
  return { title, body: parsed.content.trim(), date, start, end, recurs, url, meetLink };
}

/** Finds which folder a vault id (as used in [[wikilinks]] / graph node ids) lives in, for following a link without knowing its folder up front. */
export async function resolveVaultId(id: string): Promise<{ folder: string; taskId?: string } | undefined> {
  for (const folder of FOLDERS) {
    const dir = path.join(config.vaultPath, folder);
    const file = (await listMarkdownFiles(dir)).find(
      (f) => path.basename(f).replace(/\.md$/, "").toLowerCase() === id.toLowerCase(),
    );
    if (!file) continue;
    if (folder !== "tasks") return { folder };
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const fm = matter(raw).data as Record<string, unknown>;
    return { folder, taskId: typeof fm.id === "string" ? fm.id : undefined };
  }
  return undefined;
}

async function readVaultFiles(): Promise<RawFile[]> {
  const files: RawFile[] = [];
  for (const folder of FOLDERS) {
    const dir = path.join(config.vaultPath, folder);
    for (const file of await listMarkdownFiles(dir)) {
      const id = path.basename(file).replace(/\.md$/, "").toLowerCase();
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const parsed = matter(raw);
      const linkTargets = [...parsed.content.matchAll(WIKILINK)].map((m) => m[1].trim().toLowerCase());
      files.push({ id, folder, fm: parsed.data as Record<string, unknown>, linkTargets });
    }
  }
  return files;
}

// Mirrors apps/web/src/composables/useGrouping.ts timeBucketFor — same Kanban "time" buckets, kept
// in sync manually since the two apps don't share a package.
type TimeBucket = "overdue" | "today" | "thisWeek" | "thisMonth" | "thisQuarter" | "deferred" | "someday";
const TIME_BUCKET_ORDER: TimeBucket[] = ["overdue", "today", "thisWeek", "thisMonth", "thisQuarter", "deferred", "someday"];
const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  thisWeek: "This Week",
  thisMonth: "This Month",
  thisQuarter: "This Quarter",
  deferred: "Deferred",
  someday: "Someday",
};
// Urgency gradient, most-urgent (red) to least-urgent (gray) — Raymond asked for yellow -> orange -> red.
const TIME_BUCKET_COLORS: Record<TimeBucket, string> = {
  overdue: "#c0392b",
  today: "#e0592b",
  thisWeek: "#e8912e",
  thisMonth: "#eab308",
  thisQuarter: "#f2d049",
  deferred: "#d8cf9e",
  someday: "#b9b0a0",
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}
function endOfQuarter(date: Date): Date {
  const quarterEndMonth = Math.floor(date.getMonth() / 3) * 3 + 2;
  const d = new Date(date.getFullYear(), quarterEndMonth + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

function timeBucketFor(fm: Record<string, unknown>, now = new Date()): TimeBucket {
  const due = typeof fm.due === "string" ? fm.due : null;
  if (!due) return "someday";
  const dueDate = new Date(due);
  const diffDays = daysBetween(now, dueDate);

  if (diffDays < 0 && fm.status !== "done") return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays >= 1 && diffDays <= 7) return "thisWeek";

  const monthEndDiff = daysBetween(now, endOfMonth(now));
  const quarterEndDiff = daysBetween(now, endOfQuarter(now));
  if (diffDays > 7 && diffDays <= monthEndDiff) return "thisMonth";
  if (diffDays > monthEndDiff && diffDays <= quarterEndDiff) return "thisQuarter";
  return "deferred";
}

/** [SRE-123] -> "sre", [CORE-123] / [GA-123] -> "analytics", any other jira ticket -> unclassified (parented directly on "jira"). */
function jiraSubcategory(title: string): "sre" | "analytics" | undefined {
  const m = /^\[([A-Z]+)-\d+\]/.exec(title);
  if (!m) return undefined;
  const prefix = m[1];
  if (prefix === "SRE") return "sre";
  if (prefix === "CORE" || prefix === "GA") return "analytics";
  return undefined;
}

export async function buildVaultGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const files = await readVaultFiles();
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, string[]>();

  for (const f of files) {
    const label = typeof f.fm.title === "string" ? f.fm.title : f.id;
    const node: GraphNode = { id: f.id, label, folder: f.folder };
    if (f.folder === "tasks" && typeof f.fm.id === "string") node.taskId = f.fm.id;
    if (f.folder === "tasks" && typeof f.fm.status === "string") node.status = f.fm.status;
    if (f.folder === "notes") {
      const color = NOTE_TYPE_COLORS[f.fm.type as string];
      if (color) node.color = color;
    }
    nodes.set(f.id, node);
    if (f.linkTargets.length) links.set(f.id, f.linkTargets);
  }

  // Jira grouping: split task nodes whose source is jira into sre / analytics /
  // directly-under-jira (vague tickets, left unclassified for now).
  const jiraTaskIds = files.filter((f) => f.folder === "tasks" && (f.fm.source as any)?.type === "jira");
  if (jiraTaskIds.length) {
    nodes.set("jira", { id: "jira", label: "Jira", folder: "category" });
    const usedSubcategories = new Set<string>();
    for (const f of jiraTaskIds) {
      const sub = jiraSubcategory(typeof f.fm.title === "string" ? f.fm.title : "");
      if (sub) usedSubcategories.add(sub);
    }
    for (const sub of usedSubcategories) {
      nodes.set(sub, { id: sub, label: sub === "sre" ? "SRE" : "Analytics", folder: "category" });
      links.set(sub, [...(links.get(sub) ?? []), "jira"]);
    }
    for (const f of jiraTaskIds) {
      const sub = jiraSubcategory(typeof f.fm.title === "string" ? f.fm.title : "");
      links.set(f.id, [...(links.get(f.id) ?? []), sub ?? "jira"]);
    }
  }

  // Kanban grouping: every task links up through its actual Kanban "time" column
  // (Overdue/Today/This Week/…) into a single "kanban" node — same buckets as the
  // board, color-graded yellow -> orange -> red by urgency. Buckets with no tasks
  // are never added.
  const taskFiles = files.filter((f) => f.folder === "tasks");
  if (taskFiles.length) {
    const bucketOf = (fm: Record<string, unknown>) => timeBucketFor(fm);
    const usedBuckets = new Set(taskFiles.map((f) => bucketOf(f.fm)));
    if (usedBuckets.size) {
      nodes.set("kanban", { id: "kanban", label: "Kanban", folder: "category" });
      for (const bucket of TIME_BUCKET_ORDER) {
        if (!usedBuckets.has(bucket)) continue;
        const id = `bucket-${bucket}`;
        nodes.set(id, { id, label: TIME_BUCKET_LABELS[bucket], folder: "category", color: TIME_BUCKET_COLORS[bucket] });
        links.set(id, [...(links.get(id) ?? []), "kanban"]);
      }
      for (const f of taskFiles) {
        links.set(f.id, [...(links.get(f.id) ?? []), `bucket-${bucketOf(f.fm)}`]);
      }
    }
  }

  // Recurring-meeting grouping: a hub note with recurring:true collapses every
  // meeting instance IN ITS SERIES into the hub node itself (one node per series).
  // A meeting only counts as "in the series" if its slug (date prefix stripped)
  // matches the hub id — otherwise a recurring hub merely linking to a one-off
  // meeting for context (e.g. ai-initiative referencing the MCP discussion) would
  // wrongly swallow that unrelated meeting too.
  const mergedInto = new Map<string, string>(); // meeting node id -> hub id it merges into
  for (const f of files) {
    if (f.folder !== "notes" || (f.fm.type !== "hub" && f.fm.type !== "meeting-hub") || f.fm.recurring !== true) continue;
    for (const target of f.linkTargets) {
      if (nodes.get(target)?.folder !== "meetings") continue;
      const slug = target.replace(/^\d{4}-\d{2}-\d{2}-/, "");
      if (slug === f.id || slug.startsWith(`${f.id}-`)) mergedInto.set(target, f.id);
    }
  }
  for (const meetingId of mergedInto.keys()) nodes.delete(meetingId);

  const resolve = (id: string) => mergedInto.get(id) ?? id;

  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const [rawSource, targets] of links) {
    const source = resolve(rawSource);
    if (!nodes.has(source)) continue;
    for (const rawTarget of targets) {
      const target = resolve(rawTarget);
      if (!nodes.has(target) || target === source) continue;
      const key = [source, target].sort().join("::");
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ source, target });
    }
  }

  return { nodes: [...nodes.values()], edges };
}
