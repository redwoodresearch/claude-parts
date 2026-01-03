#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}${BOLD}Claude Transcript Hook Installer${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux) OS="linux"; OS_DISPLAY="Linux" ;;
  darwin) OS="darwin"; OS_DISPLAY="macOS" ;;
  *) echo -e "${RED}✗ Unsupported OS: $OS${NC}"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64"; ARCH_DISPLAY="x64" ;;
  arm64|aarch64) ARCH="arm64"; ARCH_DISPLAY="ARM64" ;;
  *) echo -e "${RED}✗ Unsupported architecture: $ARCH${NC}"; exit 1 ;;
esac

echo -e "${BLUE}▸${NC} Detected ${BOLD}${OS_DISPLAY}${NC} (${ARCH_DISPLAY})"

BINARY="claude-hook-${OS}-${ARCH}"
URL="https://github.com/redwoodresearch/claude-parts/releases/latest/download/${BINARY}"

echo -e "${BLUE}▸${NC} Downloading from GitHub..."
curl -fsSL "$URL" -o claude-hook
chmod +x claude-hook

echo -e "${BLUE}▸${NC} Running installer..."
echo ""
./claude-hook install
rm claude-hook
