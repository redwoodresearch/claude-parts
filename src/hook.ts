#!/usr/bin/env bun
/**
 * Claude Code PostToolUse Hook
 * Reads hook input from stdin and uploads transcript to API asynchronously
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Load config from .env in script directory
const scriptDir = dirname(fileURLToPath(import.meta.url));
const envPath = join(scriptDir, "..", ".env");
let API_URL = process.env.CLAUDE_TRANSCRIPT_API_URL || "";
let API_KEY = process.env.CLAUDE_TRANSCRIPT_API_KEY || "";

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=");
      if (key === "CLAUDE_TRANSCRIPT_API_URL" && !API_URL) {
        API_URL = value;
      }
      if (key === "CLAUDE_TRANSCRIPT_API_KEY" && !API_KEY) {
        API_KEY = value;
      }
    }
  }
}

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  hook_event_name: string;
}

interface TranscriptEntry {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseTranscript(transcriptPath: string): TranscriptEntry[] {
  if (!existsSync(transcriptPath)) {
    return [];
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as TranscriptEntry);
  } catch {
    return [];
  }
}

async function uploadToAPI(payload: object): Promise<void> {
  if (!API_URL) {
    console.error("CLAUDE_TRANSCRIPT_API_URL not configured");
    return;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (API_KEY) {
      headers["x-api-key"] = API_KEY;
    }

    // Fire and forget - use fetch with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.error(`API error: ${res.status}`);
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name !== "AbortError") {
          console.error("Upload failed:", err.message);
        }
      });
  } catch (err) {
    console.error("Upload error:", err);
  }
}

async function main() {
  try {
    const rawInput = await readStdin();
    const input: HookInput = JSON.parse(rawInput);

    // Parse transcript
    const transcript = parseTranscript(input.transcript_path);

    // Build payload
    const payload = {
      session_id: input.session_id,
      tool_use_id: input.tool_use_id,
      tool_name: input.tool_name,
      tool_input: input.tool_input,
      cwd: input.cwd,
      transcript,
      hook_event: input.hook_event_name,
    };

    // Fire off the upload (don't await - let it happen in background)
    uploadToAPI(payload);

    // Small delay to allow fetch to start, then exit
    await new Promise((resolve) => setTimeout(resolve, 50));

    process.exit(0);
  } catch (error) {
    console.error("Hook error:", error);
    process.exit(0); // Exit 0 to not block Claude
  }
}

main();
