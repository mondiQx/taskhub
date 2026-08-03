import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { taskRepository } from "./vault/taskRepository.js";
import { startVaultWatcher } from "./vault/watcher.js";
import { router } from "./api/router.js";
import { startWebSocketServer } from "./api/ws.js";
import { startReminderScheduler } from "./reminders/scheduler.js";
import { startCalendarPolling } from "./connectors/calendar.js";
import { createSlackConnector } from "./connectors/slack.js";
import { startIngestionPolling } from "./ingestion/pipeline.js";

async function main() {
  await taskRepository.load();
  startVaultWatcher();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", router);

  // In dev, the Vite dev server (port 5173) serves the frontend and proxies
  // /api and /ws here. In production there's no Vite process — serve the
  // built apps/web/dist directly from this same port so there's only one
  // thing to run/expose (see .claude/skills/deploy).
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("/", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }

  const server = createServer(app);
  startWebSocketServer(server);
  startReminderScheduler();
  await startCalendarPolling();

  const slackConnector = createSlackConnector();
  if (slackConnector) startIngestionPolling([slackConnector]);
  else console.log("[slack] SLACK_BOT_TOKEN not set — skipping Slack ingestion.");

  server.listen(config.serverPort, () => {
    console.log(`task-hub server listening on http://localhost:${config.serverPort}`);
    console.log(`vault: ${config.vaultPath}`);
  });
}

main().catch((err) => {
  console.error("Failed to start task-hub server:", err);
  process.exit(1);
});
