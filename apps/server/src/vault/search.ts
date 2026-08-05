import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import MiniSearch from "minisearch";
import { config } from "../config.js";
import { VAULT_FOLDERS } from "./graph.js";

export interface SearchDoc {
  id: string; // "<folder>/<filename-without-ext>", also the graph node id when folder !== "tasks"
  folder: string;
  title: string;
  tags: string;
  body: string;
}

export interface SearchResult {
  id: string;
  folder: string;
  title: string;
  score: number;
  match: Record<string, string[]>;
}

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

async function loadDocs(): Promise<SearchDoc[]> {
  const docs: SearchDoc[] = [];
  for (const folder of VAULT_FOLDERS) {
    const dir = path.join(config.vaultPath, folder);
    for (const file of await listMarkdownFiles(dir)) {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;
      const filenameId = file.replace(/\.md$/, "");
      const title = typeof fm.title === "string" ? fm.title : filenameId;
      const tags = Array.isArray(fm.tags) ? fm.tags.join(" ") : "";
      docs.push({ id: `${folder}/${filenameId}`, folder, title, tags, body: parsed.content });
    }
  }
  return docs;
}

/**
 * Rebuilds a fresh in-memory MiniSearch index on every call rather than
 * maintaining an incremental one — the vault is a personal, single-user
 * store (tens to low hundreds of files), so a full re-read is cheap and
 * this avoids staleness bugs entirely. This is lexical fuzzy/prefix
 * search (typo and partial-word tolerant), not semantic/embedding-based —
 * fully local, no network calls, no API key, nothing to pay for.
 */
export async function searchVault(query: string, limit = 10): Promise<SearchResult[]> {
  const docs = await loadDocs();
  const index = new MiniSearch<SearchDoc>({
    idField: "id",
    fields: ["title", "tags", "body"],
    storeFields: ["folder", "title"],
    searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 3, tags: 2 } },
  });
  index.addAll(docs);
  return index.search(query).slice(0, limit).map((r) => ({
    id: r.id as string,
    folder: r.folder as string,
    title: r.title as string,
    score: r.score,
    match: r.match,
  }));
}
