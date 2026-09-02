import { runStdioServer } from "./stdio-server.mjs";

runStdioServer({
  serverName: "mcp-allowlist-lab-allowed",
  toolName: "allowed_echo",
  responsePrefix: "ALLOWED",
});
