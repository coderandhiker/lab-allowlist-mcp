#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with sudo: sudo ./scripts/install-policy.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_POLICY="$LAB_DIR/policy/managed-settings.json"
ALLOWED_SERVER="$LAB_DIR/servers/allowed-server.mjs"
NODE_BINARY="/opt/homebrew/bin/node"
POLICY_DIR="/Library/Application Support/GitHubCopilot"
POLICY_FILE="$POLICY_DIR/managed-settings.json"
BACKUP_FILE="$POLICY_DIR/managed-settings.json.mcp-allowlist-lab.backup"
NO_ORIGINAL_MARKER="$POLICY_DIR/.mcp-allowlist-lab-no-original"

if [ ! -f "$SOURCE_POLICY" ] || [ ! -f "$ALLOWED_SERVER" ] || [ ! -x "$NODE_BINARY" ]; then
  echo "Lab files are missing under $LAB_DIR." >&2
  exit 1
fi

/usr/bin/python3 -c 'import json, sys; json.load(open(sys.argv[1]))' "$SOURCE_POLICY"
"$NODE_BINARY" "$LAB_DIR/tests/assert-policy-config.mjs"
/usr/bin/install -d -o root -g wheel -m 0755 "$POLICY_DIR"

if [ -L "$POLICY_FILE" ]; then
  echo "Refusing to replace symbolic link: $POLICY_FILE" >&2
  exit 1
fi
if [ -e "$POLICY_FILE" ] && [ ! -f "$POLICY_FILE" ]; then
  echo "Refusing to replace non-regular path: $POLICY_FILE" >&2
  exit 1
fi

if [ -e "$BACKUP_FILE" ] && [ -e "$NO_ORIGINAL_MARKER" ]; then
  echo "Inconsistent lab state: both backup and no-original marker exist." >&2
  echo "Inspect $POLICY_DIR before continuing." >&2
  exit 1
fi

if [ -e "$BACKUP_FILE" ] || [ -e "$NO_ORIGINAL_MARKER" ]; then
  if [ -f "$POLICY_FILE" ] && /usr/bin/cmp -s "$SOURCE_POLICY" "$POLICY_FILE"; then
    /usr/sbin/chown root:wheel "$POLICY_FILE"
    /bin/chmod 0644 "$POLICY_FILE"
    /usr/bin/python3 -c 'import json, sys; json.load(open(sys.argv[1]))' "$POLICY_FILE"
    echo "Machine-local Copilot lab policy is already installed:"
    /usr/bin/stat -f "  owner=%Su group=%Sg mode=%Lp path=%N" "$POLICY_FILE"
    echo
    echo "Restart every Copilot CLI process before running:"
    echo "  ./scripts/run-tests.sh enforced"
    exit 0
  fi

  echo "A prior lab backup/marker exists, but the active policy is missing or changed." >&2
  echo "Run sudo ./scripts/restore-policy.sh before installing again." >&2
  exit 1
fi

if [ -f "$POLICY_FILE" ]; then
  /bin/cp -p "$POLICY_FILE" "$BACKUP_FILE"
else
  /usr/bin/touch "$NO_ORIGINAL_MARKER"
  /usr/sbin/chown root:wheel "$NO_ORIGINAL_MARKER"
  /bin/chmod 0600 "$NO_ORIGINAL_MARKER"
fi

TEMP_FILE="$(/usr/bin/mktemp "$POLICY_DIR/.managed-settings.json.XXXXXX")"
trap '/bin/rm -f "$TEMP_FILE"' EXIT
/usr/bin/install -o root -g wheel -m 0644 "$SOURCE_POLICY" "$TEMP_FILE"
/bin/mv -f "$TEMP_FILE" "$POLICY_FILE"
trap - EXIT

if [ -L "$POLICY_FILE" ] || [ ! -f "$POLICY_FILE" ]; then
  echo "Installed policy is not a regular file." >&2
  exit 1
fi

/usr/sbin/chown root:wheel "$POLICY_FILE"
/bin/chmod 0644 "$POLICY_FILE"
/usr/bin/python3 -c 'import json, sys; json.load(open(sys.argv[1]))' "$POLICY_FILE"

echo "Installed machine-local Copilot policy:"
/usr/bin/stat -f "  owner=%Su group=%Sg mode=%Lp path=%N" "$POLICY_FILE"
echo
echo "Restart every Copilot CLI process before running:"
echo "  ./scripts/run-tests.sh enforced"
