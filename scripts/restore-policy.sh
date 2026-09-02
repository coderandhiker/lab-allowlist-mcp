#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with sudo: sudo ./scripts/restore-policy.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_POLICY="$LAB_DIR/policy/managed-settings.json"
POLICY_DIR="/Library/Application Support/GitHubCopilot"
POLICY_FILE="$POLICY_DIR/managed-settings.json"
BACKUP_FILE="$POLICY_DIR/managed-settings.json.mcp-allowlist-lab.backup"
NO_ORIGINAL_MARKER="$POLICY_DIR/.mcp-allowlist-lab-no-original"

if [ ! -d "$POLICY_DIR" ]; then
  echo "No managed-policy directory exists; nothing to restore."
  exit 0
fi

if [ -f "$POLICY_FILE" ] && ! /usr/bin/cmp -s "$SOURCE_POLICY" "$POLICY_FILE"; then
  echo "The installed managed policy changed after the lab installed it." >&2
  echo "Refusing to overwrite it. Inspect $POLICY_FILE manually." >&2
  exit 1
fi

if [ -f "$BACKUP_FILE" ]; then
  /bin/mv -f "$BACKUP_FILE" "$POLICY_FILE"
  echo "Restored the pre-lab managed policy."
elif [ -f "$NO_ORIGINAL_MARKER" ]; then
  /bin/rm -f "$POLICY_FILE"
  /bin/rm -f "$NO_ORIGINAL_MARKER"
  echo "Removed the lab policy; there was no pre-existing policy."
else
  echo "No lab backup or marker exists; nothing was changed."
  exit 0
fi

/usr/bin/rmdir "$POLICY_DIR" 2>/dev/null || true
echo "Restart Copilot CLI processes to reload managed settings."
