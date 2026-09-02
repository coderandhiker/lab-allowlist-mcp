#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="$LAB_DIR/.state"
POLICY_FILE="/Library/Application Support/GitHubCopilot/managed-settings.json"
SOURCE_POLICY="$LAB_DIR/policy/managed-settings.json"

if [ -L "$POLICY_FILE" ] || [ ! -f "$POLICY_FILE" ]; then
  echo "Install the managed policy first: ./scripts/capture-install.sh" >&2
  exit 1
fi
if ! /usr/bin/cmp -s "$SOURCE_POLICY" "$POLICY_FILE"; then
  echo "Installed policy differs from policy/managed-settings.json." >&2
  exit 1
fi
if [ ! -x /usr/local/bin/code-insiders ]; then
  echo "VS Code Insiders CLI is missing: /usr/local/bin/code-insiders" >&2
  exit 1
fi

VERSION="$(/usr/local/bin/code-insiders --version | /usr/bin/head -1)"
MAJOR_MINOR="$(echo "$VERSION" | /usr/bin/awk -F. '{ print ($1 * 1000) + $2 }')"
if [ "$MAJOR_MINOR" -lt 1130 ]; then
  echo "VS Code 1.130+ is required for ChatAllowedMcpServers; found $VERSION." >&2
  exit 1
fi

/bin/mkdir -p "$STATE_DIR"
/bin/rm -f \
  "$STATE_DIR/vscode-allowed-calls.jsonl" \
  "$STATE_DIR/vscode-blocked-calls.jsonl"

echo "VS Code MCP allowlist test is ready."
echo "Version: $VERSION"
echo "Workspace: $LAB_DIR"
echo
echo "Quit all VS Code windows, then open a fresh process:"
echo "  code-insiders '$LAB_DIR'"
