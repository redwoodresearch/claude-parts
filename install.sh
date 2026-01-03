#!/bin/bash
set -e

# Claude Transcript Hook Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/claude-intercepter/main/install.sh | bash
#
# Environment variables:
#   API_URL - Required: Your deployed Vercel API URL
#   API_KEY - Optional: API key for authentication

REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/claude-intercepter.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.claude-transcript-hook}"
CLAUDE_SETTINGS_DIR="$HOME/.claude"
CLAUDE_SETTINGS_FILE="$CLAUDE_SETTINGS_DIR/settings.json"

# These can be passed as env vars during install
API_URL="${API_URL:-}"
API_KEY="${API_KEY:-}"

echo "==> Installing Claude Transcript Hook..."

# Check for required API_URL
if [ -z "$API_URL" ]; then
    echo ""
    echo "ERROR: API_URL is required"
    echo ""
    echo "Usage:"
    echo "  API_URL=https://your-app.vercel.app/api/upload bash install.sh"
    echo ""
    echo "Or with curl:"
    echo "  curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/claude-intercepter/main/install.sh | API_URL=https://your-app.vercel.app/api/upload bash"
    echo ""
    exit 1
fi

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "==> Bun not found. Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
    echo "==> Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull origin main 2>/dev/null || true
else
    echo "==> Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies (only need bun types for the hook)
echo "==> Installing dependencies..."
bun install --production 2>/dev/null || true

# Create environment config
ENV_FILE="$INSTALL_DIR/.env"
cat > "$ENV_FILE" << EOF
# Claude Transcript Hook Configuration
CLAUDE_TRANSCRIPT_API_URL=$API_URL
CLAUDE_TRANSCRIPT_API_KEY=$API_KEY
EOF
echo "==> Created config at $ENV_FILE"

# Create Claude settings directory if needed
mkdir -p "$CLAUDE_SETTINGS_DIR"

# Configure hooks in Claude settings
echo "==> Configuring Claude Code hooks..."

HOOK_COMMAND="bun run $INSTALL_DIR/src/hook.ts"

if [ -f "$CLAUDE_SETTINGS_FILE" ]; then
    # Backup existing settings
    cp "$CLAUDE_SETTINGS_FILE" "$CLAUDE_SETTINGS_FILE.backup"

    # Check if hooks already configured
    if grep -q "claude-transcript-hook" "$CLAUDE_SETTINGS_FILE" 2>/dev/null; then
        echo "==> Hook already configured in settings.json"
    else
        # Use jq if available, otherwise provide manual instructions
        if command -v jq &> /dev/null; then
            # Add hook to existing settings
            jq --arg hook_cmd "$HOOK_COMMAND" '
                .hooks = (.hooks // {}) |
                .hooks.PostToolUse = (.hooks.PostToolUse // []) + [{
                    "matcher": "*",
                    "hooks": [{
                        "type": "command",
                        "command": $hook_cmd,
                        "timeout": 5
                    }]
                }]
            ' "$CLAUDE_SETTINGS_FILE" > "$CLAUDE_SETTINGS_FILE.tmp"
            mv "$CLAUDE_SETTINGS_FILE.tmp" "$CLAUDE_SETTINGS_FILE"
            echo "==> Hook added to existing settings.json"
        else
            echo ""
            echo "==> jq not found. Please manually add this to $CLAUDE_SETTINGS_FILE:"
            echo ""
            cat << MANUAL
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$HOOK_COMMAND",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
MANUAL
            echo ""
        fi
    fi
else
    # Create new settings file with hook
    cat > "$CLAUDE_SETTINGS_FILE" << EOF
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$HOOK_COMMAND",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
EOF
    echo "==> Created new settings.json with hook configuration"
fi

echo ""
echo "==> Installation complete!"
echo ""
echo "Configuration:"
echo "  Install location: $INSTALL_DIR"
echo "  API URL:          $API_URL"
echo "  Settings file:    $CLAUDE_SETTINGS_FILE"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code"
echo "  2. Transcripts will be uploaded after each tool call"
echo ""
echo "To update API URL or key:"
echo "  Edit $ENV_FILE"
echo ""
echo "To uninstall:"
echo "  rm -rf $INSTALL_DIR"
echo "  # Then remove the hook from $CLAUDE_SETTINGS_FILE"
