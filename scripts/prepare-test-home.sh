#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_HOME="$LAB_DIR/.copilot-home"
SOURCE_CONFIG="$LAB_DIR/config/mcp-config.json"

/usr/bin/python3 -c 'import json, sys; json.load(open(sys.argv[1]))' "$SOURCE_CONFIG"
/bin/mkdir -p "$TEST_HOME"
/bin/chmod 0700 "$TEST_HOME"
/bin/cp "$SOURCE_CONFIG" "$TEST_HOME/mcp-config.json"
/bin/chmod 0600 "$TEST_HOME/mcp-config.json"

printf '%s\n' "$TEST_HOME"
