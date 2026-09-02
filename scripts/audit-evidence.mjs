import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const labDirectory = dirname(scriptDirectory);
const evidenceDirectory = join(labDirectory, "evidence");
const machinePolicy = "/Library/Application Support/GitHubCopilot/managed-settings.json";

function read(path, fallback = "") {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return fallback;
  }
}

function evidence(phase, name, fallback = "") {
  return read(join(evidenceDirectory, phase, name), fallback);
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

const checks = [];

function check(name, condition, detail) {
  checks.push({ name, status: condition ? "PASS" : "FAIL", detail });
}

function warn(name, detail) {
  checks.push({ name, status: "WARN", detail });
}

function note(name, detail) {
  checks.push({ name, status: "NOTE", detail });
}

function notRun(name, detail) {
  checks.push({ name, status: "NOT RUN", detail });
}

function phaseWasRun(phase) {
  return evidence(phase, "exit-code.txt") !== "";
}

const sourcePolicyText = read(join(labDirectory, "policy", "managed-settings.json"));
const sourcePolicy = parseJson(sourcePolicyText, "Source policy");
const baselineInventory = parseJson(
  evidence("baseline", "mcp-list.json"),
  "Baseline MCP inventory",
);
const installedPolicyText = evidence("install", "installed-managed-settings.json");
const enforcedPolicyText = evidence("enforced", "installed-managed-settings.json");
const installMetadata = evidence("install", "policy-metadata.txt");
const installExit = evidence("install", "exit-code.txt");
const installStderr = evidence("install", "command.stderr.txt");
const allowedAuditText = evidence("live", "allowed-audit.jsonl");
const allowedAuditRecords = allowedAuditText
  .split("\n")
  .filter(Boolean)
  .map((line, index) => parseJson(line, `Allowed audit line ${index + 1}`));
const blockedAuditStatus = evidence("live", "blocked-audit-status.txt");
const blockedAuditPath = join(evidenceDirectory, "live", "blocked-audit.jsonl");
const vscodeDiagnosticsText = evidence("vscode", "policy-diagnostics.json");
const vscodeDiagnostics = vscodeDiagnosticsText
  ? parseJson(vscodeDiagnosticsText, "VS Code policy diagnostics transcription")
  : null;
const vscodeServerListText = evidence("vscode", "mcp-list-servers.json");
const vscodeServerList = vscodeServerListText
  ? parseJson(vscodeServerListText, "VS Code MCP server-list transcription")
  : null;

check(
  "Baseline completed",
  evidence("baseline", "exit-code.txt") === "0",
  "The baseline harness exited 0.",
);
check(
  "Both configurations discovered",
  Boolean(
    baselineInventory.mcpServers?.["mcp-lab-allowed"] &&
      baselineInventory.mcpServers?.["mcp-lab-blocked"],
  ),
  "Copilot's baseline inventory contains both sample local MCP configurations.",
);
check(
  "One exact command allowlisted",
  sourcePolicy.allowedMcpServers?.length === 1 &&
    sourcePolicy.allowedMcpServers[0].serverCommand?.join("\0") ===
      [
        "/opt/homebrew/bin/node",
        join(labDirectory, "servers", "allowed-server.mjs"),
      ].join("\0"),
  "The policy contains exactly the allowed server's executable and script argument.",
);
if (phaseWasRun("install")) {
  check(
    "Installed file security",
    /owner=root\b/.test(installMetadata) &&
      /group=wheel\b/.test(installMetadata) &&
      /mode=644\b/.test(installMetadata) &&
      /type=Regular File\b/.test(installMetadata),
    installMetadata || "No install metadata was captured.",
  );
  check(
    "Installed policy content",
    installedPolicyText === sourcePolicyText &&
      (!phaseWasRun("enforced") || enforcedPolicyText === sourcePolicyText),
    "Captured policy snapshots match policy/managed-settings.json byte-for-byte.",
  );

  if (
    installExit === "1" &&
    installStderr.includes("A prior lab backup/marker exists") &&
    installedPolicyText === sourcePolicyText
  ) {
    warn(
      "Initial install command capture",
      "The policy was already installed before capture-install.sh ran. Its safe duplicate-install guard refused the second install. The original install stdout was not captured, but file metadata/content and the enforced run independently verify the installed state.",
    );
  } else {
    check(
      "Policy installation command",
      installExit === "0",
      `capture-install.sh exit code: ${installExit || "missing"}`,
    );
  }
} else {
  notRun(
    "Policy installation",
    "Baseline is ready; run ./scripts/capture-install.sh.",
  );
}

if (phaseWasRun("enforced")) {
  check(
    "Enforced preflight completed",
    evidence("enforced", "exit-code.txt") === "0",
    "The root ownership, write permissions, policy content, and exact matcher preflight passed.",
  );
} else {
  notRun("Enforced preflight", "Run ./scripts/capture-evidence.sh enforced.");
}

if (phaseWasRun("live")) {
  check(
    "Allowlisted invocation completed",
    evidence("live", "exit-code.txt") === "0" &&
      evidence("live", "allowed.stdout.txt") === "ALLOWED:policy-test",
    `CLI output: ${evidence("live", "allowed.stdout.txt") || "missing"}`,
  );
  check(
    "Allowlisted tool executed",
    allowedAuditRecords.some(
      (record) =>
        record.server === "mcp-allowlist-lab-allowed" &&
        record.tool === "allowed_echo" &&
        record.input?.message === "policy-test",
    ),
    allowedAuditText || "No allowed-server audit record was captured.",
  );
  check(
    "Non-allowlisted tool not exposed",
    /not in my available toolset|don't have access/i.test(
      evidence("live", "blocked.stdout.txt"),
    ),
    `CLI output: ${evidence("live", "blocked.stdout.txt") || "missing"}`,
  );
  check(
    "Non-allowlisted tool did not execute",
    blockedAuditStatus.startsWith("ABSENT:") && !existsSync(blockedAuditPath),
    blockedAuditStatus || "Blocked audit status is missing.",
  );
  note(
    "Blocked CLI process exit code",
    "The blocked prompt process can exit 0 after returning a normal text response. The server-side audit absence is the authoritative non-execution evidence.",
  );
} else {
  notRun("Runtime invocation", "Run ./scripts/capture-evidence.sh live.");
}

if (phaseWasRun("restore")) {
  check(
    "Restore completed",
    evidence("restore", "exit-code.txt") === "0" &&
      evidence("restore", "post-restore-status.txt").startsWith("ABSENT:"),
    "The captured CLI run removed its lab policy successfully.",
  );
} else {
  notRun(
    "Policy restoration",
    existsSync(machinePolicy)
      ? "A machine policy is currently installed."
      : "Not yet needed; no machine policy is currently installed.",
  );
}

if (vscodeDiagnostics) {
  check(
    "VS Code loaded file-based policy",
    vscodeDiagnostics.observed?.activeSource === "File (managed-settings.json)" &&
      vscodeDiagnostics.observed?.winningSource === "File" &&
      vscodeDiagnostics.observed?.normalizationAndParseIssues === 0 &&
      JSON.stringify(vscodeDiagnostics.observed?.effectiveValue) ===
        JSON.stringify(sourcePolicy.allowedMcpServers),
    "Developer: Policy Diagnostics shows the file channel winning with the exact allowlist and zero parse issues.",
  );
} else {
  notRun(
    "VS Code policy diagnostics",
    "Capture Developer: Policy Diagnostics before evaluating VS Code.",
  );
}

if (vscodeServerList) {
  check(
    "VS Code blocked non-allowlisted server",
    vscodeServerList.observed?.allowedServer?.name ===
      "mcp-lab-allowed-vscode" &&
      vscodeServerList.observed?.allowedServer?.state === "Stopped" &&
      vscodeServerList.observed?.blockedServer?.name ===
        "mcp-lab-blocked-vscode" &&
      vscodeServerList.observed?.blockedServer?.state === "Error" &&
      vscodeServerList.observed?.blockedServer?.visibleErrorPrefix?.includes(
        "not in the list of servers allow",
      ),
    "MCP: List Servers shows the allowed server in a normal stopped state and the non-allowlisted server in a policy error state.",
  );
  note(
    "VS Code allowlist scope",
    "The same UI also shows WorkIQ blocked because this lab policy intentionally permits only one exact MCP command.",
  );
} else {
  notRun(
    "VS Code MCP server status",
    "Capture MCP: List Servers before evaluating VS Code enforcement.",
  );
}

if (evidence("vscode", "runtime-check-exit-code.txt") !== "") {
  check(
    "VS Code runtime invocation",
    evidence("vscode", "runtime-check-exit-code.txt") === "0",
    evidence("vscode", "runtime-check.stdout.txt") ||
      evidence("vscode", "runtime-check.stderr.txt") ||
      "VS Code runtime check produced no output.",
  );
} else {
  notRun(
    "VS Code runtime invocation",
    "Invoke both VS Code tools, then run ./scripts/capture-vscode-test.sh.",
  );
}

note(
  "Current machine policy state",
  existsSync(machinePolicy)
    ? "The lab policy is currently installed for the VS Code test."
    : "No machine-local Copilot policy is currently installed.",
);

const failures = checks.filter((item) => item.status === "FAIL");
const warnings = checks.filter((item) => item.status === "WARN");
const pending = checks.filter((item) => item.status === "NOT RUN");
const verdict = failures.length
  ? "FAIL"
  : pending.length
    ? phaseWasRun("live") && vscodeDiagnostics
      ? "INCOMPLETE - VS CODE RUNTIME PENDING"
      : "INCOMPLETE - BASELINE READY"
  : warnings.length
    ? "PASS WITH EVIDENCE CAVEATS"
    : "PASS";

console.log(`Verdict: ${verdict}`);
for (const item of checks) {
  console.log(`${item.status.padEnd(4)} ${item.name}: ${item.detail}`);
}

if (failures.length) process.exitCode = 1;
