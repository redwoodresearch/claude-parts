# Claude Transcript Hook

Automatically uploads Claude Code session transcripts to a database when sessions end.

## Install

```bash
curl -fsSL https://claude-parts.vercel.app/install.sh | bash
```

Then restart Claude Code.

## Uninstall

```bash
rm -rf ~/.local/share/claude-transcript-hook
```

Then remove the `SessionEnd` hook from `~/.claude/settings.json`.
