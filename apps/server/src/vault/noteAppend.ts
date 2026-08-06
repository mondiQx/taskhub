import fs from "node:fs/promises";

/** Inserts `line` as the first bullet directly under `## {heading}` in a body (frontmatter untouched), adding the heading if absent. */
export function insertUnderHeading(body: string, heading: string, line: string): string {
  const headingRe = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const match = headingRe.exec(body);
  if (!match) {
    const trimmed = body.trimEnd();
    return trimmed.length ? `${trimmed}\n\n## ${heading}\n${line}\n` : `## ${heading}\n${line}\n`;
  }
  const insertAt = match.index + match[0].length;
  return `${body.slice(0, insertAt)}\n${line}\n${body.slice(insertAt)}`;
}

/** Appends `text` under `heading` in a vault markdown file, preserving its frontmatter block untouched. */
export async function appendUnderHeadingInFile(absPath: string, heading: string, text: string): Promise<void> {
  const raw = await fs.readFile(absPath, "utf8");
  const fmMatch = /^---\n[\s\S]*?\n---\n/.exec(raw);
  const frontmatter = fmMatch ? fmMatch[0] : "";
  const body = raw.slice(frontmatter.length);
  const updated = insertUnderHeading(body, heading, text);
  await fs.writeFile(absPath, frontmatter + updated, "utf8");
}
