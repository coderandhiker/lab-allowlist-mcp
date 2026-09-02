import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const labDirectory = dirname(testDirectory);

const config = JSON.parse(
  readFileSync(join(labDirectory, "config", "mcp-config.json"), "utf8"),
);
const vscodeConfig = JSON.parse(
  readFileSync(join(labDirectory, ".vscode", "mcp.json"), "utf8"),
);
const policy = JSON.parse(
  readFileSync(join(labDirectory, "policy", "managed-settings.json"), "utf8"),
);

const allowedConfig = config.mcpServers["mcp-lab-allowed"];
const blockedConfig = config.mcpServers["mcp-lab-blocked"];
const allowlist = policy.allowedMcpServers;
const expectedNode = "/opt/homebrew/bin/node";
const expectedAllowedEntrypoint = join(labDirectory, "servers", "allowed-server.mjs");
const expectedBlockedEntrypoint = join(labDirectory, "servers", "blocked-server.mjs");

assert.equal(allowlist.length, 1, "Policy must contain exactly one MCP allowlist entry");
assert.equal(allowedConfig.command, expectedNode, "Unexpected Node executable");
assert.equal(blockedConfig.command, expectedNode, "Unexpected Node executable");
assert.deepEqual(allowedConfig.args, [expectedAllowedEntrypoint], "Allowed server path is stale");
assert.deepEqual(blockedConfig.args, [expectedBlockedEntrypoint], "Blocked server path is stale");

const allowedCommand = [allowedConfig.command, ...allowedConfig.args];
const blockedCommand = [blockedConfig.command, ...blockedConfig.args];
const vscodeAllowed = vscodeConfig.servers["mcp-lab-allowed-vscode"];
const vscodeBlocked = vscodeConfig.servers["mcp-lab-blocked-vscode"];
const vscodeAllowedCommand = [vscodeAllowed.command, ...vscodeAllowed.args];
const vscodeBlockedCommand = [vscodeBlocked.command, ...vscodeBlocked.args];

assert.deepEqual(
  allowlist[0].serverCommand,
  allowedCommand,
  "Policy command does not exactly match the allowed MCP configuration",
);
assert.notDeepEqual(
  allowlist[0].serverCommand,
  blockedCommand,
  "Blocked MCP configuration unexpectedly matches the allowlist",
);
assert.deepEqual(
  allowlist[0].serverCommand,
  vscodeAllowedCommand,
  "Policy command does not exactly match the allowed VS Code MCP configuration",
);
assert.notDeepEqual(
  allowlist[0].serverCommand,
  vscodeBlockedCommand,
  "Blocked VS Code MCP configuration unexpectedly matches the allowlist",
);

console.log(
  "PASS policy matcher: only the allowed CLI and VS Code servers match serverCommand.",
);
