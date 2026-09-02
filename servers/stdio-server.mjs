import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

function writeAuditRecord(serverName, toolName, input) {
  const auditFile = process.env.MCP_LAB_AUDIT_FILE;
  if (!auditFile) return;

  mkdirSync(dirname(auditFile), { recursive: true });
  appendFileSync(
    auditFile,
    `${JSON.stringify({
      server: serverName,
      tool: toolName,
      input,
      timestamp: new Date().toISOString(),
    })}\n`,
  );
}

export function runStdioServer({ serverName, toolName, responsePrefix }) {
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  function send(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }

  function result(id, value) {
    send({ jsonrpc: "2.0", id, result: value });
  }

  function error(id, code, message) {
    send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  input.on("line", (line) => {
    if (!line.trim()) return;

    let request;
    try {
      request = JSON.parse(line);
    } catch {
      error(null, -32700, "Parse error");
      return;
    }

    if (!Object.hasOwn(request, "id")) return;

    switch (request.method) {
      case "initialize":
        result(request.id, {
          protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: serverName, version: "1.0.0" },
        });
        break;
      case "ping":
        result(request.id, {});
        break;
      case "tools/list":
        result(request.id, {
          tools: [
            {
              name: toolName,
              description: `Echo a message from the ${serverName} test server.`,
              inputSchema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
                required: ["message"],
                additionalProperties: false,
              },
            },
          ],
        });
        break;
      case "tools/call": {
        if (request.params?.name !== toolName) {
          result(request.id, {
            isError: true,
            content: [{ type: "text", text: `Unknown tool: ${request.params?.name}` }],
          });
          break;
        }

        const message = request.params.arguments?.message ?? "";
        writeAuditRecord(serverName, toolName, { message });
        result(request.id, {
          content: [{ type: "text", text: `${responsePrefix}:${message}` }],
        });
        break;
      }
      default:
        error(request.id, -32601, `Method not found: ${request.method}`);
    }
  });
}
