#!/bin/bash
set -euo pipefail

if [ "${1:-}" != "--yes" ]; then
  echo "This optional test makes two model requests and consumes AI credits." >&2
  echo "Run ./scripts/run-live-agent-tests.sh --yes to continue." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_HOME="$("$SCRIPT_DIR/prepare-test-home.sh")"
STATE_DIR="$LAB_DIR/.state"
ALLOWED_LOG="$STATE_DIR/allowed-calls.jsonl"
BLOCKED_LOG="$STATE_DIR/blocked-calls.jsonl"
RESULT_DIR="$LAB_DIR/test-results/$(/bin/date +%Y%m%d-%H%M%S)-live"
POLICY_FILE="/Library/Application Support/GitHubCopilot/managed-settings.json"
SOURCE_POLICY="$LAB_DIR/policy/managed-settings.json"

if [ -L "$POLICY_FILE" ] || [ ! -f "$POLICY_FILE" ]; then
  echo "Install the managed policy first: sudo ./scripts/install-policy.sh" >&2
  exit 1
fi
if ! /usr/bin/cmp -s "$SOURCE_POLICY" "$POLICY_FILE"; then
  echo "Installed policy differs from the lab policy; refusing the live test." >&2
  exit 1
fi

/bin/mkdir -p "$STATE_DIR" "$RESULT_DIR"
echo "Results: $RESULT_DIR"
/bin/rm -f "$ALLOWED_LOG" "$BLOCKED_LOG"

echo "Calling the allowlisted tool through Copilot..."
(
  export COPILOT_HOME="$TEST_HOME"
  cd "$LAB_DIR"
  copilot -p "Call mcp-lab-allowed's allowed_echo tool with message policy-test. Return only the tool result." \
    --allow-tool="mcp-lab-allowed(allowed_echo)" \
    --no-ask-user \
    -s
) >"$RESULT_DIR/allowed.out" 2>"$RESULT_DIR/allowed.err"

if [ ! -s "$ALLOWED_LOG" ]; then
  echo "FAIL: the allowlisted tool did not write its audit record." >&2
  exit 1
fi

echo "Attempting to call the blocked tool through Copilot..."
set +e
(
  export COPILOT_HOME="$TEST_HOME"
  cd "$LAB_DIR"
  copilot -p "Call mcp-lab-blocked's blocked_echo tool with message policy-test. Return only the tool result." \
    --allow-tool="mcp-lab-blocked(blocked_echo)" \
    --no-ask-user \
    -s
) >"$RESULT_DIR/blocked.out" 2>"$RESULT_DIR/blocked.err"
BLOCKED_EXIT=$?
set -e

if [ -s "$BLOCKED_LOG" ]; then
  echo "FAIL: the blocked MCP tool executed despite managed policy." >&2
  exit 1
fi

echo "PASS: allowlisted tool executed and blocked tool did not."
echo "Blocked request exit code: $BLOCKED_EXIT"
