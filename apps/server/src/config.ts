import dotenv from "dotenv";
import path from "node:path";

// npm workspaces sets cwd to apps/server when this runs via
// `npm run dev -w apps/server`; the shared .env lives at the repo root.
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

// Everything below is resolved relative to process.cwd() (apps/server).
export const config = {
  vaultPath: path.resolve(process.cwd(), process.env.VAULT_PATH ?? "../../vault"),
  dataPath: path.resolve(process.cwd(), process.env.DATA_PATH ?? "../../.data"),
  serverPort: Number(process.env.SERVER_PORT ?? 4173),
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirectPort: Number(process.env.GOOGLE_OAUTH_REDIRECT_PORT ?? 8765),
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN ?? "",
  },
  credentialsDir: path.resolve(process.cwd(), "../../.credentials"),
  // Optional: local checkout of customizer-core's `.claude` dir, used to read-only
  // annotate Jira-sourced tasks with prior investigation history. Undefined (feature
  // no-ops) on any machine that doesn't have that repo checked out.
  customizerCorePath: process.env.CUSTOMIZER_CORE_PATH
    ? path.resolve(process.cwd(), process.env.CUSTOMIZER_CORE_PATH)
    : undefined,
};
