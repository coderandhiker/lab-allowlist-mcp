# Local MCP allowlist lab

This macOS-only lab proves that file-based enterprise managed settings can allow one exact local `stdio` MCP command while blocking another.

## What it creates

- `mcp-lab-allowed`: local server exposing `allowed_echo`
- `mcp-lab-blocked`: local server exposing `blocked_echo`
- Isolated Copilot config under `.copilot-home/`
- Machine policy at `/Library/Application Support/GitHubCopilot/managed-settings.json`

The policy allowlists only:

```text
/opt/homebrew/bin/node /Users/chris/labs/local-mcp-allowlist/servers/allowed-server.mjs
```

Matching is exact across the command and every argument. This validates command-level governance, not code signing or file-integrity enforcement. The sample server remains in a user-writable lab directory; a production allowlist should point to an administrator-controlled executable and script location.

## Runbook

From this directory:

```bash
cd /Users/chris/labs/local-mcp-allowlist
```

1. Prove both servers work without managed policy and capture the evidence:

   ```bash
   ./scripts/capture-evidence.sh baseline
   ```

2. Install the machine-local policy and capture its ownership, permissions, and contents:

   ```bash
   ./scripts/capture-install.sh
   ```

3. Exit all running Copilot CLI processes, then verify the installed policy, permissions, and isolated test configuration:

   ```bash
   ./scripts/capture-evidence.sh enforced
   ```

4. Run the runtime enforcement proof. It makes two model requests and therefore consumes AI credits:

   ```bash
   ./scripts/capture-evidence.sh live
   ```

5. Restore the prior machine state:

   ```bash
   ./scripts/capture-restore.sh
   ```

The capture wrappers invoke `sudo` and prompt for your password. Restart Copilot CLI after installing or restoring policy. The installer backs up an existing policy and refuses to overwrite symlinks or an unresolved prior lab backup.

## Expected results

| Stage | `mcp-lab-allowed` | `mcp-lab-blocked` |
|---|---|---|
| Baseline | Functional and configured | Functional and configured |
| Enforced preflight | Exact allowlist match | No allowlist match |
| Runtime proof | `allowed_echo` writes an audit record | No audit record |

Results are written under `test-results/`. Runtime state is confined to `.copilot-home/` and `.state/`; your normal `~/.copilot` configuration is not modified.

Stable evidence is copied into `evidence/`, and every capture checks the evidence and regenerates [`REPORT.md`](REPORT.md) with the exact commands, outputs, policy, MCP configuration, environment, and documentation links.

## VS Code validation

See [`VSCODE.md`](VSCODE.md) for the equivalent VS Code test using the same machine policy and two workspace MCP servers.

## Sources

- [Configure enterprise-managed settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings)
- [Managed MCP matching semantics](https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings#allowedmcpservers)
- [Configure MCP servers in Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)

## License

[MIT](LICENSE)
