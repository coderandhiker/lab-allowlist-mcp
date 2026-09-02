import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const labDirectory = dirname(testDirectory);

async function request(child, responses, id, method, params = {}) {
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      responses.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 5000);

    responses.set(id, (message) => {
      clearTimeout(timeout);
      resolve(message);
    });
  });

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return response;
}

async function smokeServer(entrypoint, toolName, expectedText) {
  const child = spawn("/usr/bin/env", ["node", entrypoint], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, MCP_LAB_AUDIT_FILE: "" },
  });
  const responses = new Map();
  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => {
    const message = JSON.parse(line);
    const resolve = responses.get(message.id);
    if (resolve) {
      responses.delete(message.id);
      resolve(message);
    }
  });

  const initialized = await request(child, responses, 1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-allowlist-lab", version: "1.0.0" },
  });
  assert.equal(initialized.result.protocolVersion, "2025-06-18");

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );

  const tools = await request(child, responses, 2, "tools/list");
  assert.deepEqual(tools.result.tools.map((tool) => tool.name), [toolName]);

  const call = await request(child, responses, 3, "tools/call", {
    name: toolName,
    arguments: { message: "smoke" },
  });
  assert.equal(call.result.content[0].text, expectedText);

  child.stdin.end();
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(stderr, "");
}

await smokeServer(
  join(labDirectory, "servers", "allowed-server.mjs"),
  "allowed_echo",
  "ALLOWED:smoke",
);
await smokeServer(
  join(labDirectory, "servers", "blocked-server.mjs"),
  "blocked_echo",
  "BLOCKED:smoke",
);

console.log("PASS direct MCP smoke test: both sample servers are functional.");
