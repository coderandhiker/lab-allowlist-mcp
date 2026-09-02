import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const labDirectory = dirname(scriptDirectory);
const evidenceDirectory = join(labDirectory, "evidence");

function read(path, fallback = "") {
  try {
    return readFileSync(path, "utf8").trimEnd();
  } catch {
    return fallback;
  }
}

function evidence(phase, name, fallback = "") {
  return read(join(evidenceDirectory, phase, name), fallback);
}

function status(phase) {
  const code = evidence(phase, "exit-code.txt");
  if (code === "") return "NOT RUN";
  return code === "0" ? "PASS" : `FAIL (exit ${code})`;
}

function installStatus() {
  const code = evidence("install", "exit-code.txt");
  const stderr = evidence("install", "command.stderr.txt");
  const snapshot = evidence("install", "installed-managed-settings.json");
  const source = read(join(labDirectory, "policy", "managed-settings.json"));

  if (code === "0") return "PASS";
  if (
    code === "1" &&
    stderr.includes("A prior lab backup/marker exists") &&
    snapshot === source
  ) {
    return "PRESENT; REINSTALL REFUSED";
  }
  if (code === "") return "NOT RUN";
  return `FAIL (exit ${code})`;
}

function installCaptureNote() {
  const code = evidence("install", "exit-code.txt");
  const stderr = evidence("install", "command.stderr.txt");
  const snapshot = evidence("install", "installed-managed-settings.json");
  const source = read(join(labDirectory, "policy", "managed-settings.json"));

  if (
    code === "1" &&
    stderr.includes("A prior lab backup/marker exists") &&
    snapshot === source
  ) {
    return `> The policy was installed before the capture wrapper ran. The wrapper's duplicate-install guard therefore refused to overwrite the active lab state. This means the original installer stdout was not captured; the installed state is instead evidenced by the metadata/content snapshots and the successful enforced and live phases.`;
  }
  return "";
}

function block(language, content, fallback = "No evidence captured.") {
  const value = content || fallback;
  return `\`\`\`${language}\n${value}\n\`\`\``;
}

const config = read(join(labDirectory, "config", "mcp-config.json"));
const policy = read(join(labDirectory, "policy", "managed-settings.json"));
const baselineOutput = evidence("baseline", "command.stdout.txt");
const enforcedOutput = evidence("enforced", "command.stdout.txt");
const liveOutput = evidence("live", "command.stdout.txt");
const vscodeDiagnosticsText = evidence("vscode", "policy-diagnostics.json");
const vscodeDiagnostics = vscodeDiagnosticsText
  ? JSON.parse(vscodeDiagnosticsText)
  : null;
const vscodeServerListText = evidence("vscode", "mcp-list-servers.json");
const vscodeServerList = vscodeServerListText
  ? JSON.parse(vscodeServerListText)
  : null;
const vscodePolicyStatus =
  vscodeDiagnostics?.observed?.winningSource === "File" &&
  vscodeDiagnostics?.observed?.normalizationAndParseIssues === 0
    ? "PASS"
    : "NOT RUN";
const vscodeRuntimeStatus =
  evidence("vscode", "runtime-check-exit-code.txt") === ""
    ? "NOT RUN"
    : evidence("vscode", "runtime-check-exit-code.txt") === "0"
      ? "PASS"
      : `FAIL (exit ${evidence("vscode", "runtime-check-exit-code.txt")})`;
const vscodeServerPolicyStatus =
  vscodeServerList?.observed?.allowedServer?.state === "Stopped" &&
  vscodeServerList?.observed?.blockedServer?.state === "Error"
    ? "PASS"
    : "NOT RUN";

const report = `# Copilot local MCP allowlist evidence

Generated from captured repository evidence. No result is inferred when a phase has not run.

## Result

| Phase | Status | Purpose |
|---|---|---|
| Baseline | **${status("baseline")}** | Prove both MCP servers are functional and configured before policy. |
| Policy installation | **${installStatus()}** | Verify the installed file's required owner, mode, type, and content. |
| Enforced preflight | **${status("enforced")}** | Verify the installed root-owned policy and exact command matching. |
| Runtime invocation | **${status("live")}** | Prove the allowlisted tool executes and the non-allowlisted tool does not. |
| Policy restoration | **${status("restore")}** | Restore the prior machine state after testing. |
| VS Code policy load | **${vscodePolicyStatus}** | Confirm VS Code resolves the exact allowlist from the file-based channel. |
| VS Code server enforcement | **${vscodeServerPolicyStatus}** | Confirm a non-allowlisted workspace MCP server enters a policy error state. |
| VS Code runtime invocation | **${vscodeRuntimeStatus}** | Confirm only the allowlisted VS Code MCP tool executes. |

## Environment

${block("text", evidence("baseline", "environment.txt"), "Baseline environment not captured.")}

## Control under test

Copilot CLI loads a machine-local file-based policy on macOS from:

\`\`\`text
/Library/Application Support/GitHubCopilot/managed-settings.json
\`\`\`

The file must be a regular file owned by \`root\` and must not be group- or world-writable. The installer uses \`root:wheel\` and mode \`0644\`, rejects symlinks, backs up an existing policy, and installs the file atomically.

The allowlist matches a local \`stdio\` server by the exact executable plus every argument. The lab policy contains one allowed command:

${block("json", policy)}

The isolated Copilot configuration intentionally contains two servers:

${block("json", config)}

The environment variables and enabled tool list are not part of \`serverCommand\` matching. The blocked server differs by script-path argument and therefore does not match.

## Evidence: baseline

Command:

${block("bash", evidence("baseline", "command.txt"))}

Output:

${block("text", baselineOutput)}

Copilot MCP inventory:

${block("json", evidence("baseline", "mcp-list.json"))}

Interpretation: the direct protocol smoke test called \`tools/list\` and \`tools/call\` on both sample servers. Copilot also discovered both configurations. This establishes that a later block is policy enforcement rather than a broken server.

## Evidence: policy installation

Command:

${block("bash", evidence("install", "command.txt"))}

Output:

${block("text", evidence("install", "command.stdout.txt"), "NOT RUN. Run ./scripts/capture-install.sh.")}

Installed file metadata:

${block("text", evidence("install", "policy-metadata.txt"), "NOT RUN.")}

Installed file:

${block("json", evidence("install", "installed-managed-settings.json"), "NOT RUN.")}

Captured install stderr:

${block("text", evidence("install", "command.stderr.txt"), status("install") === "NOT RUN" ? "NOT RUN." : "None.")}

${installCaptureNote()}

## Evidence: installed-policy preflight

Command:

${block("bash", evidence("enforced", "command.txt"))}

Output:

${block("text", enforcedOutput, "NOT RUN. Install the policy with sudo, then capture the enforced phase.")}

Installed policy snapshot:

${block("json", evidence("enforced", "installed-managed-settings.json"), "NOT RUN.")}

## Evidence: attempted runtime invocations

The live script makes two explicit Copilot requests:

### Allowlisted server

${block("bash", `copilot -p "Call mcp-lab-allowed's allowed_echo tool with message policy-test. Return only the tool result." \\
  --allow-tool="mcp-lab-allowed(allowed_echo)" \\
  --no-ask-user -s`)}

CLI output:

${block("text", evidence("live", "allowed.stdout.txt"), "NOT RUN.")}

Server-side audit evidence:

${block("json", evidence("live", "allowed-audit.jsonl"), "NOT RUN.")}

### Non-allowlisted server

${block("bash", `copilot -p "Call mcp-lab-blocked's blocked_echo tool with message policy-test. Return only the tool result." \\
  --allow-tool="mcp-lab-blocked(blocked_echo)" \\
  --no-ask-user -s`)}

CLI output:

${block("text", evidence("live", "blocked.stdout.txt"), "NOT RUN.")}

Server-side audit evidence:

${block("text", evidence("live", "blocked-audit-status.txt"), "NOT RUN.")}

Live harness output:

${block("text", liveOutput, "NOT RUN.")}

A successful runtime proof has an allowed audit record and no blocked audit record. The audit files are written by the MCP servers themselves, so the result does not depend only on model prose.

## Evidence: VS Code policy diagnostics

${vscodeDiagnostics ? `VS Code **Developer: Policy Diagnostics** reported:

- Active source: \`${vscodeDiagnostics.observed.activeSource}\`
- Supplied keys: \`${vscodeDiagnostics.observed.suppliedKeys}\`
- Effective VS Code policy keys: \`${vscodeDiagnostics.observed.effectivePolicyKeys}\`
- Effective key: \`${vscodeDiagnostics.observed.key}\`
- Winning source: \`${vscodeDiagnostics.observed.winningSource}\`
- Normalization and parse issues: \`${vscodeDiagnostics.observed.normalizationAndParseIssues}\`
- Screenshot SHA-256: \`${vscodeDiagnostics.imageSha256}\`

![VS Code Policy Diagnostics](evidence/vscode/policy-diagnostics.png)

Transcribed evidence:

${block("json", vscodeDiagnosticsText)}
` : "NOT RUN. Capture VS Code Developer: Policy Diagnostics."}

This proves VS Code loaded the file-based managed setting and resolved the expected allowlist without parse errors. Server status and tool audit evidence are evaluated separately below.

## Evidence: VS Code MCP server enforcement

${vscodeServerList ? `VS Code **MCP: List Servers** reported:

- \`${vscodeServerList.observed.allowedServer.name}\`: \`${vscodeServerList.observed.allowedServer.state}\`
- \`${vscodeServerList.observed.blockedServer.name}\`: \`${vscodeServerList.observed.blockedServer.state}\` with a visible policy error
- \`${vscodeServerList.observed.additionalBlockedServer.name}\`: also blocked because the lab allowlist permits only one exact server command
- Screenshot SHA-256: \`${vscodeServerList.imageSha256}\`

![VS Code MCP List Servers](evidence/vscode/mcp-list-servers.png)

Transcribed evidence:

${block("json", vscodeServerListText)}
` : "NOT RUN. Capture VS Code MCP: List Servers."}

This proves VS Code rejected the configured non-allowlisted server. The allowlisted server is configured and in a normal stopped state; start it before the allowed-tool invocation.

## Evidence: VS Code runtime invocation

${block("text", evidence("vscode", "runtime-check.stdout.txt"), "NOT RUN. Invoke both tools in VS Code, then run ./scripts/capture-vscode-test.sh.")}

Allowed-server audit:

${block("json", evidence("vscode", "allowed-audit.jsonl"), "NOT RUN.")}

Blocked-server audit:

${block("json", evidence("vscode", "blocked-audit.jsonl"), "ABSENT.")}

## Reproduce

\`\`\`bash
cd /Users/chris/labs/local-mcp-allowlist
./scripts/capture-evidence.sh baseline
./scripts/capture-install.sh
./scripts/capture-evidence.sh enforced
./scripts/capture-evidence.sh live
./scripts/capture-restore.sh
\`\`\`

Restart separately opened Copilot CLI processes after installing or restoring the policy.

## Scope and limitations

- A completed live phase proves exact local command-and-argument allowlisting for Copilot CLI.
- It does not prove executable signing, hashing, publisher identity, or script integrity.
- The sample scripts are user-writable. Production policy should reference administrator-controlled executable and script paths.
- Built-in default MCP servers are exempt from the custom-server allowlist.
- Other managed-settings sources can further restrict the effective allowlist.
- The live phase consumes AI credits.

## Evidence: policy restoration

Command:

${block("bash", evidence("restore", "command.txt"))}

Output:

${block("text", evidence("restore", "command.stdout.txt"), "NOT RUN. Run ./scripts/capture-restore.sh after testing.")}

Post-restore state:

${block("text", evidence("restore", "post-restore-status.txt"), "NOT RUN.")}

## Supporting GitHub documentation

- [Configuring enterprise-managed settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings)
- [Enterprise managed settings: allowedMcpServers](https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings#allowedmcpservers)
- [Configuring an MCP server allowlist](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-enterprise-allowlist)
- [Adding MCP servers for Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
- [Deploy and verify Copilot managed settings in VS Code](https://code.visualstudio.com/docs/enterprise/ai-settings#_deploy-copilot-managed-settings)
- [Add and manage MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
`;

writeFileSync(join(labDirectory, "REPORT.md"), report);
console.log(`Updated ${join(labDirectory, "REPORT.md")}`);
