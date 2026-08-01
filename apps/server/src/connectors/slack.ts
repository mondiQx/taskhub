import { WebClient } from "@slack/web-api";
import { config } from "../config.js";
import type { Connector } from "./base.js";
import type { NewTaskInput } from "../types.js";

const POLL_LOOKBACK_MS = 10 * 60_000;

/**
 * Uses Raymond's existing free Slack bot token — no new Slack app/OAuth
 * setup. Surfaces messages that @mention the bot in channels it's already
 * a member of, since a bot token (unlike a user token) can't see personal
 * starred/saved items.
 */
export function createSlackConnector(): Connector | undefined {
  if (!config.slack.botToken) return undefined;

  const client = new WebClient(config.slack.botToken);
  let botUserId: string | undefined;
  let lastPolledAt = Date.now() - POLL_LOOKBACK_MS;

  return {
    name: "slack",
    async poll(): Promise<NewTaskInput[]> {
      botUserId ??= (await client.auth.test()).user_id as string;
      const since = lastPolledAt;
      lastPolledAt = Date.now();

      const channels = await listJoinedChannels(client);
      const results: NewTaskInput[] = [];

      for (const channel of channels) {
        const history = await client.conversations.history({
          channel: channel.id!,
          oldest: String(since / 1000),
        });
        for (const message of history.messages ?? []) {
          if (!message.ts || !message.text?.includes(`<@${botUserId}>`)) continue;
          results.push({
            title: message.text.replace(`<@${botUserId}>`, "").trim().slice(0, 120) || "Slack mention",
            body: message.text,
            source: { type: "slack", externalId: `${channel.id}:${message.ts}`, url: null },
          });
        }
      }
      return results;
    },
  };
}

async function listJoinedChannels(client: WebClient) {
  const res = await client.conversations.list({ types: "public_channel,private_channel", exclude_archived: true });
  return (res.channels ?? []).filter((c) => c.is_member);
}
