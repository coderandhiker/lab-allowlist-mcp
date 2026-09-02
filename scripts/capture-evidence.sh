#!/bin/bash
set -euo pipefail

PHASE="${1:-}"
if [ "$PHASE" != "baseline" ] && [ "$PHASE" != "enforced" ] && [ "$PHASE" != "live" ]; then
  echo "Usage: ./scripts/capture-evidence.sh baseline|enforced|live" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EVIDENCE_DIR="$LAB_DIR/evidence/$PHASE"
STDOUT_FILE="$EVIDENCE_DIR/command.stdout.txt"
STDERR_FILE="$EVIDENCE_DIR/command.stderr.txt"
EXIT_FILE="$EVIDENCE_DIR/exit-code.txt"
COMMAND_FILE="$EVIDENCE_DIR/command.txt"
ENVIRONMENT_FILE="$EVIDENCE_DIR/environment.txt"
POLICY_FILE="/Library/Application Support/GitHubCopilot/managed-settings.json"

/bin/mkdir -p "$EVIDENCE_DIR"
/bin/rm -f \
  "$STDOUT_FILE" \
  "$STDERR_FILE" \
  "$EXIT_FILE" \
  "$COMMAND_FILE" \
  "$ENVIRONMENT_FILE" \
  "$EVIDENCE_DIR/mcp-list.json" \
  "$EVIDENCE_DIR/mcp-list.stderr.txt" \
  "$EVIDENCE_DIR/allowed.stdout.txt" \
  "$EVIDENCE_DIR/allowed.stderr.txt" \
  "$EVIDENCE_DIR/blocked.stdout.txt" \
  "$EVIDENCE_DIR/blocked.stderr.txt" \
  "$EVIDENCE_DIR/allowed-audit.jsonl" \
  "$EVIDENCE_DIR/blocked-audit.jsonl" \
  "$EVIDENCE_DIR/blocked-audit-status.txt" \
  "$EVIDENCE_DIR/installed-managed-settings.json"

{
  echo "captured_at=$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"
  /usr/bin/sw_vers
  echo "Architecture: $(/usr/bin/uname -m)"
  /opt/homebrew/bin/copilot --version
  echo "Node: $(/opt/homebrew/bin/node --version)"
  if [ -f "$POLICY_FILE" ]; then
    /usr/bin/stat -f "Managed policy: owner=%Su group=%Sg mode=%Lp path=%N" "$POLICY_FILE"
  else
    echo "Managed policy: absent"
  fi
} >"$ENVIRONMENT_FILE"

if [ -f "$POLICY_FILE" ]; then
  /bin/cp "$POLICY_FILE" "$EVIDENCE_DIR/installed-managed-settings.json"
fi

if [ "$PHASE" = "live" ]; then
  echo "./scripts/run-live-agent-tests.sh --yes" >"$COMMAND_FILE"
  set +e
  "$SCRIPT_DIR/run-live-agent-tests.sh" --yes >"$STDOUT_FILE" 2>"$STDERR_FILE"
  STATUS=$?
  set -e
else
  echo "./scripts/run-tests.sh $PHASE" >"$COMMAND_FILE"
  set +e
  "$SCRIPT_DIR/run-tests.sh" "$PHASE" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  STATUS=$?
  set -e
fi

echo "$STATUS" >"$EXIT_FILE"
/bin/cat "$STDOUT_FILE"
if [ -s "$STDERR_FILE" ]; then
  /bin/cat "$STDERR_FILE" >&2
fi

RESULT_DIR="$(/usr/bin/awk -F ': ' '/^Results: / { value=$2 } END { print value }' "$STDOUT_FILE")"
if [ -n "$RESULT_DIR" ] && [ -d "$RESULT_DIR" ]; then
  if [ -f "$RESULT_DIR/mcp-list.json" ]; then
    /bin/cp "$RESULT_DIR/mcp-list.json" "$EVIDENCE_DIR/mcp-list.json"
  fi
  if [ -f "$RESULT_DIR/mcp-list.stderr" ]; then
    /bin/cp "$RESULT_DIR/mcp-list.stderr" "$EVIDENCE_DIR/mcp-list.stderr.txt"
  fi
  if [ -f "$RESULT_DIR/allowed.out" ]; then
    /bin/cp "$RESULT_DIR/allowed.out" "$EVIDENCE_DIR/allowed.stdout.txt"
  fi
  if [ -f "$RESULT_DIR/allowed.err" ]; then
    /bin/cp "$RESULT_DIR/allowed.err" "$EVIDENCE_DIR/allowed.stderr.txt"
  fi
  if [ -f "$RESULT_DIR/blocked.out" ]; then
    /bin/cp "$RESULT_DIR/blocked.out" "$EVIDENCE_DIR/blocked.stdout.txt"
  fi
  if [ -f "$RESULT_DIR/blocked.err" ]; then
    /bin/cp "$RESULT_DIR/blocked.err" "$EVIDENCE_DIR/blocked.stderr.txt"
  fi
fi

if [ "$PHASE" = "live" ]; then
  if [ -f "$LAB_DIR/.state/allowed-calls.jsonl" ]; then
    /bin/cp "$LAB_DIR/.state/allowed-calls.jsonl" "$EVIDENCE_DIR/allowed-audit.jsonl"
  fi
  if [ -f "$LAB_DIR/.state/blocked-calls.jsonl" ]; then
    /bin/cp "$LAB_DIR/.state/blocked-calls.jsonl" "$EVIDENCE_DIR/blocked-audit.jsonl"
    echo "PRESENT: the blocked server tool executed." >"$EVIDENCE_DIR/blocked-audit-status.txt"
  else
    echo "ABSENT: no blocked-server tool invocation was recorded." >"$EVIDENCE_DIR/blocked-audit-status.txt"
  fi
fi

/opt/homebrew/bin/node "$SCRIPT_DIR/audit-evidence.mjs" || true
/opt/homebrew/bin/node "$SCRIPT_DIR/render-report.mjs"
exit "$STATUS"
