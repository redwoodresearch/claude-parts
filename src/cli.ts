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

// ============ Hook Command ============

async function hook() {
  log("INFO", "Hook triggered");

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of Bun.stdin.stream()) {
      chunks.push(Buffer.from(chunk));
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    log("INFO", "Received input", { session_id: input.session_id, reason: input.reason });

    let transcript: unknown[] = [];
    if (existsSync(input.transcript_path)) {
      const content = readFileSync(input.transcript_path, "utf-8");
      transcript = content.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
      log("INFO", "Parsed transcript", { entries: transcript.length });
    } else {
      log("WARN", "Transcript file not found", { path: input.transcript_path });
    }

    const payload = {
      session_id: input.session_id,
      transcript,
      reason: input.reason,
    };

    log("INFO", "Sending request to API", { url: API_URL, payload_size: JSON.stringify(payload).length });

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

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

  process.exit(0);
}

// ============ Install Command ============

async function install() {
  console.log("\n==> Installing Claude Transcript Hook\n");

  // Copy binary
  mkdirSync(INSTALL_DIR, { recursive: true });
  copyFileSync(process.execPath, BINARY_PATH);
  await chmod(BINARY_PATH, 0o755);
  console.log(`Installed: ${BINARY_PATH}`);

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
    console.log(`Configured: ${CLAUDE_SETTINGS_FILE}`);
  } else {
    console.log("Already configured");
  }

  console.log(`Logs: ${LOG_FILE}`);
  console.log("\nDone! Restart Claude Code to activate.\n");
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
