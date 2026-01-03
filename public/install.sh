#!/bin/bash
set -e

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux) OS="linux" ;;
  darwin) OS="darwin" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

BINARY="claude-hook-${OS}-${ARCH}"
URL="https://github.com/redwoodresearch/claude-parts/releases/latest/download/${BINARY}"

echo "Downloading ${BINARY}..."
curl -fsSL "$URL" -o claude-hook
chmod +x claude-hook
./claude-hook install
rm claude-hook

echo "Done! Restart Claude Code to activate."
