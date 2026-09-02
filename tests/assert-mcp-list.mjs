import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const [mode, resultPath] = process.argv.slice(2);
assert.ok(["baseline", "enforced"].includes(mode), "Mode must be baseline or enforced");
assert.ok(resultPath, "Path to mcp-list.json is required");

const document = JSON.parse(readFileSync(resultPath, "utf8"));

function findNamedObject(value, name) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value) && value.name === name) return value;
  if (
    !Array.isArray(value) &&
    Object.hasOwn(value, name) &&
    value[name] &&
    typeof value[name] === "object"
  ) {
    return { name, ...value[name] };
  }

  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const match = findNamedObject(child, name);
    if (match) return match;
  }
  return null;
}

function describe(value) {
  return JSON.stringify(value).toLowerCase();
}

const allowed = findNamedObject(document, "mcp-lab-allowed");
const blocked = findNamedObject(document, "mcp-lab-blocked");

assert.ok(allowed, "mcp-lab-allowed was not present in Copilot's MCP inventory");
assert.ok(blocked, "mcp-lab-blocked was not present in Copilot's MCP inventory");

const allowedText = describe(allowed);
const blockedText = describe(blocked);

assert.equal(allowed.enabled, true, "Allowed server is disabled in test configuration");
assert.equal(blocked.enabled, true, "Blocked-test server is disabled in test configuration");
assert.doesNotMatch(allowedText, /invalid configuration/, "Allowed config is invalid");
assert.doesNotMatch(blockedText, /invalid configuration/, "Blocked config is invalid");

console.log(`PASS Copilot MCP configuration inventory assertions (${mode}).`);
console.log(`  allowed: ${JSON.stringify(allowed)}`);
console.log(`  blocked: ${JSON.stringify(blocked)}`);
