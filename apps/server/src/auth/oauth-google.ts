import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { google } from "googleapis";
import { config } from "../config.js";

const CREDENTIALS_FILE = path.join(config.credentialsDir, "google.json");
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

function buildOAuthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    `http://127.0.0.1:${config.google.redirectPort}/oauth/callback`,
  );
}

async function loadStoredTokens(): Promise<{ refresh_token: string } | undefined> {
  try {
    return JSON.parse(await fs.readFile(CREDENTIALS_FILE, "utf8"));
  } catch {
    return undefined;
  }
}

async function storeTokens(tokens: { refresh_token?: string | null }): Promise<void> {
  await fs.mkdir(config.credentialsDir, { recursive: true });
  await fs.writeFile(CREDENTIALS_FILE, JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2));
}

/** Returns an authorized client for API calls, or undefined if the one-time consent flow hasn't been run yet. */
export async function getAuthorizedGoogleClient() {
  if (!config.google.clientId || !config.google.clientSecret) return undefined;
  const stored = await loadStoredTokens();
  if (!stored?.refresh_token) return undefined;

  const client = buildOAuthClient();
  client.setCredentials({ refresh_token: stored.refresh_token });
  return client;
}

/**
 * One-time interactive consent flow for Gmail/Calendar-equivalent OAuth apps.
 * Run manually via `tsx src/auth/setup-google.ts` — not part of the normal
 * server boot. Prints a consent URL to open in a browser, listens on the
 * loopback redirect port for the callback, exchanges the code, and persists
 * the refresh token to .credentials/google.json.
 */
export async function runGoogleConsentFlow(): Promise<void> {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first.");
  }

  const client = buildOAuthClient();
  const authUrl = client.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });

  console.log("\nOpen this URL in a browser to authorize Calendar access:\n");
  console.log(authUrl, "\n");

  const code = await waitForCallbackCode(config.google.redirectPort);
  const { tokens } = await client.getToken(code);
  await storeTokens(tokens);
  console.log("Saved Google OAuth refresh token to .credentials/google.json");
}

function waitForCallbackCode(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", `http://127.0.0.1:${port}`);
      const code = url.searchParams.get("code");
      res.end(code ? "Authorized — you can close this tab." : "Missing authorization code.");
      server.close();
      if (code) resolve(code);
      else reject(new Error("No authorization code returned"));
    });
    server.listen(port);
  });
}
