# Control MCP server access in GitHub Copilot

GitHub Copilot managed settings can restrict which Model Context Protocol (MCP) servers developers may run in supported Copilot clients, including GitHub Copilot CLI and VS Code.

This guide shows how to allow approved remote and local MCP servers without requiring a private MCP registry.

## Prerequisites

1. Enable the **MCP servers in Copilot** policy for the enterprise or applicable organizations.
2. If access is currently restricted to a custom registry, set **Restrict MCP access to registry servers** to **Allow all** and optionally clear **MCP Registry URL**. This avoids conflicting policy layers.
3. Use current versions of GitHub Copilot CLI and supported IDE extensions.
4. Decide how to deliver `managed-settings.json`:
   - **Server-managed** is recommended for most enterprises because it provides centralized review and audit history.
   - **MDM-managed** is appropriate for device-group targeting on macOS and Windows.
   - **File-based** is useful for local evaluation or configuration-management systems.

See [Configuring an MCP server allowlist for your enterprise](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-enterprise-allowlist).

## Remote URL versus local command matching

MCP classification is based on transport:

| MCP transport | Client configuration | Managed-policy matcher | Matching behavior |
|---|---|---|---|
| Remote HTTP or SSE | `url` | `serverUrl` | Matches the server URL. Supports documented wildcard patterns for subdomains and path prefixes. |
| Local `stdio` process | `command` plus `args` | `serverCommand` | Matches the exact executable and every argument. Wildcards and command-line expansion are not supported. |

For enforcement, prefer `serverUrl` or `serverCommand` over `serverName`. Server names are user-assigned labels and do not strongly identify the underlying server.

See [`allowedMcpServers` matching semantics](https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings#allowedmcpservers).

### Remote MCP example

Client configuration:

```json
{
  "type": "http",
  "url": "https://mcp.example.com/mcp"
}
```

Managed policy:

```json
{
  "allowedMcpServers": [
    {
      "serverUrl": "https://mcp.example.com/*"
    }
  ]
}
```

### Local MCP example

Client configuration:

```json
{
  "type": "stdio",
  "command": "/opt/company/bin/company-mcp",
  "args": [
    "--stdio",
    "--profile",
    "production"
  ]
}
```

Managed policy:

```json
{
  "allowedMcpServers": [
    {
      "serverCommand": [
        "/opt/company/bin/company-mcp",
        "--stdio",
        "--profile",
        "production"
      ]
    }
  ]
}
```

The `serverCommand` array is the flattened client command: the executable first, followed by each argument in the same order. These configurations do **not** match:

```text
/opt/company/bin/company-mcp --stdio --profile production
/usr/bin/env company-mcp --stdio --profile production
```

Wrapper commands, executable paths, argument order, versions, and flags must match the deployed client configuration exactly.

## Define the enterprise allowlist

The following policy allows one remote server and two exact local commands:

```json
{
  "allowedMcpServers": [
    {
      "serverUrl": "https://mcp.example.com/*"
    },
    {
      "serverCommand": [
        "/opt/company/bin/company-mcp",
        "--stdio",
        "--profile",
        "production"
      ]
    },
    {
      "serverCommand": [
        "npx",
        "-y",
        "@example/approved-mcp@1.2.3"
      ]
    }
  ]
}
```

When `allowedMcpServers` is present:

1. Built-in default MCP servers remain allowed.
2. A server matching `deniedMcpServers` is blocked.
3. A non-default server that does not match `allowedMcpServers` is blocked.
4. A URL or command containing an unresolved variable is blocked.

A malformed allowlist is treated as an empty allowlist, blocking all non-default MCP servers. If multiple managed-setting sources define MCP controls, deny rules and restrictive allowlists from those sources also apply.

## Deploy the policy

### Recommended: server-managed

1. Create or select the enterprise `.github-private` repository used for governance.
2. Add the policy at:

   ```text
   copilot/managed-settings.json
   ```

3. Commit it to the default branch.
4. Allow approximately one hour for automatic refresh, or restart/sign in to the client to trigger an immediate refresh.

Follow [Configuring enterprise-managed settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings#deploying-server-managed-settings).

### File-based evaluation

Use the platform-specific path:

| Platform | Path |
|---|---|
| macOS | `/Library/Application Support/GitHubCopilot/managed-settings.json` |
| Windows | `%ProgramFiles%\GitHubCopilot\managed-settings.json` |
| Linux | `/etc/github-copilot/managed-settings.json` |

On macOS, merge the MCP keys into any existing managed settings, then install the file as a regular, root-owned file that is not group- or world-writable:

```bash
sudo install -d -o root -g wheel -m 0755 \
  "/Library/Application Support/GitHubCopilot"

sudo install -o root -g wheel -m 0644 managed-settings.json \
  "/Library/Application Support/GitHubCopilot/managed-settings.json"
```

Do not use a symbolic link. Restart Copilot CLI and VS Code after changing a file-based policy.

## Configure the MCP servers

The allowlist controls which servers may run; it does not install or configure the servers.

### Copilot CLI

Configure user-level servers in `~/.copilot/mcp-config.json` under `mcpServers`, or add one with:

```bash
copilot mcp add approved-local -- \
  /opt/company/bin/company-mcp --stdio --profile production
```

See [Adding MCP servers for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers).

### VS Code

Configure workspace servers in `.vscode/mcp.json` under `servers`, or use **MCP: Add Server** from the Command Palette.

See [Add and manage MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

## Verify enforcement

### Copilot CLI

1. Restart Copilot CLI.
2. Run `/mcp list` in an interactive session.
3. Confirm the approved server starts and exposes its tools.
4. Add a second server whose URL or command is not allowlisted.
5. Confirm the second server is blocked and its tools are unavailable.

### VS Code

1. Fully restart VS Code.
2. Run **Developer: Policy Diagnostics**.
3. Confirm `allowedMcpServers` has the expected value and winning source.
4. Run **MCP: List Servers**.
5. Confirm the approved server can start and the non-allowlisted server reports an organization-policy error.
6. Open **Configure Tools** in Copilot Chat and confirm only approved tools are available.

See [Deploy Copilot managed settings in VS Code](https://code.visualstudio.com/docs/enterprise/ai-settings#_deploy-copilot-managed-settings).

## Security considerations

- `serverCommand` validates the configured command and arguments; it is not executable signing or file-integrity enforcement.
- Place approved local executables and scripts in administrator-controlled locations.
- Pin package versions where practical instead of using mutable tags such as `latest`.
- Review the tools, credentials, filesystem access, and network access exposed by every allowed server.
- Use `deniedMcpServers` for configurations that must remain blocked even if they also match an allowlist entry.

## Reproduce the behavior

This repository includes a macOS lab with two local MCP servers, captured CLI and VS Code evidence, and cleanup scripts:

- [Lab runbook](LAB-README.md)
- [CLI and VS Code evidence](REPORT.md)
- [VS Code validation](VSCODE.md)

## License

[MIT](LICENSE)
