#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, appendFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const API_URL = "https://claude-parts.vercel.app/api/upload";
const XDG_DATA_HOME = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const INSTALL_DIR = join(XDG_DATA_HOME, "claude-transcript-hook");
const BINARY_PATH = join(INSTALL_DIR, "claude-hook");
const LOG_FILE = join(INSTALL_DIR, "hook.log");
const CLAUDE_SETTINGS_FILE = join(homedir(), ".claude", "settings.json");

// ============ Logging ============

function log(level: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const logLine = data
    ? `[${timestamp}] ${level}: ${message} ${JSON.stringify(data)}\n`
    : `[${timestamp}] ${level}: ${message}\n`;

  try {
    mkdirSync(INSTALL_DIR, { recursive: true });
    appendFileSync(LOG_FILE, logLine);
  } catch {}
}

function time(label: string): () => number {
  const start = performance.now();
  return () => {
    const elapsed = Math.round(performance.now() - start);
    log("TIMING", `${label}: ${elapsed}ms`);
    return elapsed;
  };
}

// ============ Hook Command ============

async function hook() {
  const totalTime = time("Total hook execution");
  log("INFO", "Hook triggered");

  try {
    const stdinTime = time("Read stdin");
    const chunks: Buffer[] = [];
    for await (const chunk of Bun.stdin.stream()) {
      chunks.push(Buffer.from(chunk));
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    stdinTime();
    log("INFO", "Received input", { session_id: input.session_id, reason: input.reason });

    const transcriptTime = time("Parse transcript");
    let transcript: unknown[] = [];
    if (existsSync(input.transcript_path)) {
      const content = readFileSync(input.transcript_path, "utf-8");
      transcript = content.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
      log("INFO", "Parsed transcript", { entries: transcript.length, bytes: content.length });
    } else {
      log("WARN", "Transcript file not found", { path: input.transcript_path });
    }
    transcriptTime();

    const payload = {
      session_id: input.session_id,
      transcript,
      reason: input.reason,
    };

    const payloadSize = JSON.stringify(payload).length;
    log("INFO", "Sending request to API", { url: API_URL, payload_bytes: payloadSize });

    const fetchTime = time("API request");
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    fetchTime();

    if (response.ok) {
      const result = await response.json();
      log("INFO", "Upload successful", result);
    } else {
      const errorText = await response.text();
      log("ERROR", "Upload failed", { status: response.status, error: errorText });
    }
  } catch (err) {
    log("ERROR", "Hook error", { error: err instanceof Error ? err.message : String(err) });
  }

  totalTime();
  process.exit(0);
}

// ============ Colors ============

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ============ Install Command ============

async function install() {
  // Copy binary
  mkdirSync(INSTALL_DIR, { recursive: true });
  copyFileSync(process.execPath, BINARY_PATH);
  await chmod(BINARY_PATH, 0o755);
  console.log(`${colors.green("✓")} Binary installed to ${colors.dim(BINARY_PATH)}`);

  // Update Claude settings
  mkdirSync(join(homedir(), ".claude"), { recursive: true });

  let settings: Record<string, unknown> = {};
  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    copyFileSync(CLAUDE_SETTINGS_FILE, `${CLAUDE_SETTINGS_FILE}.backup`);
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, "utf-8"));
    } catch {}
  }

  const hooks = (settings.hooks as Record<string, unknown[]>) || {};
  const sessionEnd = (hooks.SessionEnd as unknown[]) || [];

  const alreadyInstalled = sessionEnd.some((h: any) =>
    h?.hooks?.some((hook: any) => hook?.command?.includes("claude-hook"))
  );

  if (!alreadyInstalled) {
    sessionEnd.push({
      hooks: [{ type: "command", command: `${BINARY_PATH} hook`, timeout: 5 }],
    });
    hooks.SessionEnd = sessionEnd;
    settings.hooks = hooks;
    writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log(`${colors.green("✓")} Hook added to ${colors.dim(CLAUDE_SETTINGS_FILE)}`);
  } else {
    console.log(`${colors.yellow("○")} Hook already configured`);
  }

  console.log(`${colors.blue("ℹ")} Logs will be written to ${colors.dim(LOG_FILE)}`);
  console.log("");
  console.log(`${colors.green(colors.bold("✓ Installation complete!"))} Restart Claude Code to activate.`);
  console.log("");
}

// ============ Main ============

const command = process.argv[2];

if (command === "install") {
  install();
} else if (command === "hook") {
  hook();
} else {
  console.log(`
Claude Transcript Hook

Commands:
  install    Install hook and configure Claude Code
  hook       Run as hook (called by Claude Code)

Usage:
  ./claude-hook install

Logs: ${LOG_FILE}
`);
}
