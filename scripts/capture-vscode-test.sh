#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EVIDENCE_DIR="$LAB_DIR/evidence/vscode"
STATE_DIR="$LAB_DIR/.state"

/bin/mkdir -p "$EVIDENCE_DIR"
/bin/rm -f \
  "$EVIDENCE_DIR/runtime-check.stdout.txt" \
  "$EVIDENCE_DIR/runtime-check.stderr.txt" \
  "$EVIDENCE_DIR/runtime-check-exit-code.txt" \
  "$EVIDENCE_DIR/allowed-audit.jsonl" \
  "$EVIDENCE_DIR/blocked-audit.jsonl"

set +e
/opt/homebrew/bin/node "$SCRIPT_DIR/check-vscode-test.mjs" \
  >"$EVIDENCE_DIR/runtime-check.stdout.txt" \
  2>"$EVIDENCE_DIR/runtime-check.stderr.txt"
STATUS=$?
set -e
echo "$STATUS" >"$EVIDENCE_DIR/runtime-check-exit-code.txt"

if [ -f "$STATE_DIR/vscode-allowed-calls.jsonl" ]; then
  /bin/cp "$STATE_DIR/vscode-allowed-calls.jsonl" "$EVIDENCE_DIR/allowed-audit.jsonl"
fi
if [ -f "$STATE_DIR/vscode-blocked-calls.jsonl" ]; then
  /bin/cp "$STATE_DIR/vscode-blocked-calls.jsonl" "$EVIDENCE_DIR/blocked-audit.jsonl"
fi

/bin/cat "$EVIDENCE_DIR/runtime-check.stdout.txt"
if [ -s "$EVIDENCE_DIR/runtime-check.stderr.txt" ]; then
  /bin/cat "$EVIDENCE_DIR/runtime-check.stderr.txt" >&2
fi

/opt/homebrew/bin/node "$SCRIPT_DIR/audit-evidence.mjs" || true
/opt/homebrew/bin/node "$SCRIPT_DIR/render-report.mjs"
exit "$STATUS"
