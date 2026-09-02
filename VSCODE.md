# Validate the local MCP allowlist in VS Code

VS Code 1.130+ supports the `allowedMcpServers` managed setting through the `ChatAllowedMcpServers` policy. This machine has VS Code Insiders 1.137, which meets that requirement.

## Test configuration

The workspace file [`.vscode/mcp.json`](.vscode/mcp.json) configures:

- `mcp-lab-allowed-vscode` → `allowed-server.mjs` → tool `allowed_echo`
- `mcp-lab-blocked-vscode` → `blocked-server.mjs` → tool `blocked_echo`

The machine policy allowlists only the exact command and argument for `allowed-server.mjs`.

## Procedure

1. Install the policy if it is not currently installed:

   ```bash
   cd ~/labs/local-mcp-allowlist
   ./scripts/capture-install.sh
   ```

2. Clear prior VS Code audit records and check prerequisites:

   ```bash
   ./scripts/prepare-vscode-test.sh
   ```

3. Fully quit VS Code Insiders, then open a new process on this repository:

   ```bash
   code-insiders ~/labs/local-mcp-allowlist
   ```

   File-based managed settings are loaded at startup. Reloading only the workspace is not the strongest test; quit the application process.

4. Confirm VS Code loaded the policy:

   - Open the Command Palette.
   - Run **Developer: Policy Diagnostics**.
   - Find `ChatAllowedMcpServers`.
   - Confirm the effective value contains only:

     ```json
     {
       "serverCommand": [
         "/opt/homebrew/bin/node",
         "/Users/chris/labs/local-mcp-allowlist/servers/allowed-server.mjs"
       ]
     }
     ```

   - Confirm the source is the file-based Copilot managed-settings channel.

5. Confirm server status:

   - Run **MCP: List Servers**.
   - Start or inspect `mcp-lab-allowed-vscode`; it should start and expose `allowed_echo`.
   - Start or inspect `mcp-lab-blocked-vscode`; it should report that the MCP server is blocked by your organization or otherwise remain unavailable because of policy.
   - Select **Show Output** for either server if its status is unclear.

6. Confirm the effective chat tool list:

   - Open Copilot Chat in Agent mode.
   - Select **Configure Tools** in the chat input.
   - Search for `allowed_echo`: it should be available.
   - Search for `blocked_echo`: it should be absent.

7. Invoke both paths:

   Allowed prompt:

   ```text
   Use the allowed_echo tool from mcp-lab-allowed-vscode with message vscode-policy-test. Return only the tool result.
   ```

   Expected result:

   ```text
   ALLOWED:vscode-policy-test
   ```

   Blocked prompt:

   ```text
   Use the blocked_echo tool from mcp-lab-blocked-vscode with message vscode-policy-test. Return only the tool result.
   ```

   Expected result: Copilot says the tool is unavailable or cannot call it.

8. Verify execution independently of model text:

   ```bash
   ./scripts/capture-vscode-test.sh
   ```

   The check passes only when the allowed server recorded `vscode-policy-test` and the blocked server recorded nothing. It also copies the audit evidence into `evidence/vscode/` and refreshes `REPORT.md`.

9. Restore the machine policy when finished:

   ```bash
   ./scripts/capture-restore.sh
   ```

## Evidence hierarchy

1. **Policy Diagnostics** proves VS Code loaded the expected file-based policy.
2. **MCP: List Servers** and **Configure Tools** prove the policy changed server/tool availability.
3. The server-side audit check proves only the allowlisted tool actually executed.

## Supporting documentation

- [Deploy and verify Copilot managed settings in VS Code](https://code.visualstudio.com/docs/enterprise/ai-settings#_deploy-copilot-managed-settings)
- [Add, manage, and troubleshoot MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [GitHub managed MCP matching semantics](https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings#allowedmcpservers)
