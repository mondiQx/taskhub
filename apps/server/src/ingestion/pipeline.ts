import { taskRepository } from "../vault/taskRepository.js";
import type { Connector } from "../connectors/base.js";

const POLL_MS = 3 * 60_000;

/**
 * Runs each connector's poll() and dedups on source.type + source.externalId
 * — if a task already exists for that key, its fields are updated in place
 * rather than creating a duplicate. Gmail/Jira never go through here; they're
 * written directly to the vault by the sync-inbox Claude skill.
 */
export function startIngestionPolling(connectors: Connector[]): void {
  if (!connectors.length) return;
  const run = () => runOnce(connectors);
  run();
  setInterval(run, POLL_MS);
}

async function runOnce(connectors: Connector[]): Promise<void> {
  for (const connector of connectors) {
    try {
      const items = await connector.poll();
      for (const item of items) {
        if (!item.source?.externalId) continue;
        const existing = taskRepository.findBySourceExternalId(item.source.type, item.source.externalId);
        if (existing) {
          await taskRepository.update(existing.id, { title: item.title, body: item.body ?? existing.body });
        } else {
          await taskRepository.create(item);
        }
      }
    } catch (err) {
      console.error(`[ingestion] ${connector.name} poll failed:`, err);
    }
  }
}
