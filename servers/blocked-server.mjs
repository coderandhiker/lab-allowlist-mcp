import { runStdioServer } from "./stdio-server.mjs";

runStdioServer({
  serverName: "mcp-allowlist-lab-blocked",
  toolName: "blocked_echo",
  responsePrefix: "BLOCKED",
});
