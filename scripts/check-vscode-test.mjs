import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const labDirectory = dirname(scriptDirectory);
const stateDirectory = join(labDirectory, ".state");
const allowedPath = join(stateDirectory, "vscode-allowed-calls.jsonl");
const blockedPath = join(stateDirectory, "vscode-blocked-calls.jsonl");

function readRecords(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const allowed = readRecords(allowedPath);
const blocked = readRecords(blockedPath);

const allowedProof = allowed.some(
  (record) =>
    record.server === "mcp-allowlist-lab-allowed" &&
    record.tool === "allowed_echo" &&
    record.input?.message === "vscode-policy-test",
);

if (!allowedProof) {
  console.error("FAIL: no VS Code allowed_echo audit record for vscode-policy-test.");
  process.exitCode = 1;
} else {
  console.log("PASS: VS Code executed the allowlisted allowed_echo tool.");
}

if (blocked.length) {
  console.error("FAIL: the non-allowlisted blocked_echo tool executed:");
  console.error(JSON.stringify(blocked, null, 2));
  process.exitCode = 1;
} else {
  console.log("PASS: no blocked-server invocation was recorded.");
}

if (allowed.length) {
  console.log("\nAllowed audit records:");
  console.log(JSON.stringify(allowed, null, 2));
}
