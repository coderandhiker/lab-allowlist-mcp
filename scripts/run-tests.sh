#!/bin/bash
set -euo pipefail

MODE="${1:-}"
if [ "$MODE" != "baseline" ] && [ "$MODE" != "enforced" ]; then
  echo "Usage: ./scripts/run-tests.sh baseline|enforced" >&2
  exit 2
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This lab targets macOS." >&2
  exit 1
fi

for command_name in copilot node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done
if [ ! -x /opt/homebrew/bin/node ]; then
  echo "Expected Homebrew Node executable is missing: /opt/homebrew/bin/node" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
POLICY_FILE="/Library/Application Support/GitHubCopilot/managed-settings.json"
SOURCE_POLICY="$LAB_DIR/policy/managed-settings.json"
RESULT_DIR="$LAB_DIR/test-results/$(/bin/date +%Y%m%d-%H%M%S)-$MODE"
MCP_LIST_JSON="$RESULT_DIR/mcp-list.json"
MCP_LIST_STDERR="$RESULT_DIR/mcp-list.stderr"

/bin/mkdir -p "$RESULT_DIR"
echo "Results: $RESULT_DIR"

echo "1/5 Directly smoke-testing both MCP servers..."
node "$LAB_DIR/tests/smoke-servers.mjs"

echo "2/5 Verifying exact policy-to-command matching..."
node "$LAB_DIR/tests/assert-policy-config.mjs"

if [ "$MODE" = "baseline" ]; then
  echo "3/5 Confirming no machine-local managed policy is installed..."
  if [ -e "$POLICY_FILE" ] || [ -L "$POLICY_FILE" ]; then
    echo "Baseline mode requires no policy at $POLICY_FILE." >&2
    echo "Restore the policy first: sudo ./scripts/restore-policy.sh" >&2
    exit 1
  fi
else
  echo "3/5 Checking installed policy security and content..."
  if [ -L "$POLICY_FILE" ] || [ ! -f "$POLICY_FILE" ]; then
    echo "Managed policy is missing or not a regular file: $POLICY_FILE" >&2
    exit 1
  fi

  OWNER="$(/usr/bin/stat -f "%Su" "$POLICY_FILE")"
  MODE_BITS="$(/usr/bin/stat -f "%Lp" "$POLICY_FILE")"
  if [ "$OWNER" != "root" ]; then
    echo "Managed policy owner must be root; found $OWNER." >&2
    exit 1
  fi
  if [ $((8#$MODE_BITS & 0022)) -ne 0 ]; then
    echo "Managed policy must not be group/world writable; mode is $MODE_BITS." >&2
    exit 1
  fi
  if ! /usr/bin/cmp -s "$SOURCE_POLICY" "$POLICY_FILE"; then
    echo "Installed policy differs from the lab policy." >&2
    exit 1
  fi
fi

echo "4/5 Preparing an isolated Copilot configuration..."
TEST_HOME="$("$SCRIPT_DIR/prepare-test-home.sh")"

echo "5/5 Asking Copilot CLI to inventory both configured servers..."
(
  export COPILOT_HOME="$TEST_HOME"
  cd "$LAB_DIR"
  copilot mcp list --json
) >"$MCP_LIST_JSON" 2>"$MCP_LIST_STDERR"

node "$LAB_DIR/tests/assert-mcp-list.mjs" "$MODE" "$MCP_LIST_JSON"

echo
if [ "$MODE" = "baseline" ]; then
  echo "PASS baseline: both servers are valid and present in Copilot configuration."
else
  echo "PASS enforced preflight: policy security, policy content, and test configuration are valid."
  echo "Run ./scripts/run-live-agent-tests.sh --yes for the runtime allow/block proof."
fi
