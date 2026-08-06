import { spawn } from "node:child_process";
import path from "node:path";

// apps/server/src -> repo root is two levels up from process.cwd() (apps/server)
const repoRoot = path.resolve(process.cwd(), "../..");

function buildCleanupPrompt(rawText: string): string {
  return (
    "Correct this speech-to-text transcript from a personal journal dictation. The " +
    "speaker is a non-native English speaker, so the ASR sometimes mis-hears a word or " +
    "garbles a clause based on pronunciation — fix those using context, along with " +
    "punctuation and casing. Do not change the meaning, drop content, or add anything not " +
    "implied by the original. Output ONLY the corrected transcript text — no preamble, no " +
    "quotes, no explanation.\n\n" +
    `Transcript:\n${rawText}`
  );
}

/**
 * Runs a one-shot cleanup pass over a voice-dictated transcript via the headless
 * Claude Code CLI (same mechanism as journalAnalysisRun.ts) so this doesn't require
 * a separate paid transcription/LLM API — it reuses the user's own Claude Code CLI.
 *
 * Unlike journalAnalysisRun.ts, this call never needs to touch the filesystem or run
 * a tool — it only transforms text — so it deliberately does NOT use
 * bypassPermissions. This endpoint takes arbitrary text from an unauthenticated local
 * request body; granting tool access here would turn a text-cleanup call into an
 * unrestricted remote-code-execution path if a request (or a prompt-injection payload
 * spoken into the mic) tried to instruct it to run something.
 */
export function cleanVoiceTranscript(rawText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", buildCleanupPrompt(rawText), "--output-format", "json", "--tools", ""],
      { cwd: repoRoot },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `claude exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const result = typeof parsed.result === "string" ? parsed.result.trim() : "";
        if (!result) throw new Error("empty result from claude");
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to parse claude output: ${(err as Error).message}`));
      }
    });
  });
}
