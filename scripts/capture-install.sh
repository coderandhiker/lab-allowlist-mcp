#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this capture wrapper as your normal user; it invokes sudo itself." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EVIDENCE_DIR="$LAB_DIR/evidence/install"
POLICY_FILE="/Library/Application Support/GitHubCopilot/managed-settings.json"

/bin/mkdir -p "$EVIDENCE_DIR"
/bin/rm -f \
  "$EVIDENCE_DIR/command.stdout.txt" \
  "$EVIDENCE_DIR/command.stderr.txt" \
  "$EVIDENCE_DIR/command.txt" \
  "$EVIDENCE_DIR/exit-code.txt" \
  "$EVIDENCE_DIR/policy-metadata.txt" \
  "$EVIDENCE_DIR/installed-managed-settings.json"

echo "sudo ./scripts/install-policy.sh" >"$EVIDENCE_DIR/command.txt"
set +e
/usr/bin/sudo "$SCRIPT_DIR/install-policy.sh" \
  >"$EVIDENCE_DIR/command.stdout.txt" \
  2>"$EVIDENCE_DIR/command.stderr.txt"
STATUS=$?
set -e
echo "$STATUS" >"$EVIDENCE_DIR/exit-code.txt"

/bin/cat "$EVIDENCE_DIR/command.stdout.txt"
if [ -s "$EVIDENCE_DIR/command.stderr.txt" ]; then
  /bin/cat "$EVIDENCE_DIR/command.stderr.txt" >&2
fi

if [ -f "$POLICY_FILE" ]; then
  /usr/bin/stat -f "owner=%Su group=%Sg mode=%Lp type=%HT path=%N" "$POLICY_FILE" \
    >"$EVIDENCE_DIR/policy-metadata.txt"
  /bin/cp "$POLICY_FILE" "$EVIDENCE_DIR/installed-managed-settings.json"
fi

/opt/homebrew/bin/node "$SCRIPT_DIR/audit-evidence.mjs" || true
/opt/homebrew/bin/node "$SCRIPT_DIR/render-report.mjs"
exit "$STATUS"
