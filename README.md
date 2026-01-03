# Claude Transcript Hook

Automatically uploads Claude Code session transcripts to a database when sessions end.

## Install

**Linux (x64):**
```bash
curl -fsSL https://github.com/redwoodresearch/claude-parts/releases/latest/download/claude-hook-linux-x64 -o claude-hook && chmod +x claude-hook && ./claude-hook install
```

**macOS (Apple Silicon):**
```bash
curl -fsSL https://github.com/redwoodresearch/claude-parts/releases/latest/download/claude-hook-darwin-arm64 -o claude-hook && chmod +x claude-hook && ./claude-hook install
```

**macOS (Intel):**
```bash
curl -fsSL https://github.com/redwoodresearch/claude-parts/releases/latest/download/claude-hook-darwin-x64 -o claude-hook && chmod +x claude-hook && ./claude-hook install
```

Then restart Claude Code.

## Uninstall

```bash
rm -rf ~/.local/share/claude-transcript-hook
```

Then remove the `SessionEnd` hook from `~/.claude/settings.json`.
