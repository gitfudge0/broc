import { buildMcpConfig } from "./bootstrap.js";
import type { DetectedClient, InstallSummary } from "./types.js";

function titleizeClient(client: DetectedClient["client"] | "generic"): string {
  switch (client) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "opencode":
      return "OpenCode";
    default:
      return "Generic MCP";
  }
}

function detectionLabel(client: DetectedClient): string {
  if (client.status === "detected") {
    return `detected via ${client.method}: ${client.evidence}`;
  }
  if (client.status === "likely_installed") {
    return `likely installed via ${client.method}: ${client.evidence}`;
  }
  return "not detected";
}

function clientConfigSection(client: DetectedClient["client"] | "generic", wrapperPath: string, copySupported: boolean): string[] {
  const command = `broc mcp-config --client=${client}${copySupported ? " --copy" : ""}`;
  return [
    `[${titleizeClient(client)}]`,
    `  Command: ${command}`,
    "  Paste this into your MCP client config:",
    buildMcpConfig(wrapperPath, client),
  ];
}

export function renderInstallSummary(summary: InstallSummary): string {
  const lines = [
    "Install complete.",
    `  version: ${summary.installVersion}`,
    `  install root: ${summary.installRoot}`,
    `  wrapper: ${summary.wrapperPath}`,
    `  public broc: ${summary.publicExecutablePath}`,
  ];

  if (summary.managedRuntimePath) {
    lines.push(`  runtime: ${summary.managedRuntimePath}`);
  }

  lines.push("");

  if (summary.pathSetup.alreadyOnPath) {
    lines.push(`PATH: ${summary.pathSetup.publicBinDir} is already on PATH.`);
  } else if (summary.pathSetup.updatedFiles.length > 0) {
    lines.push(`PATH: added ${summary.pathSetup.publicBinDir} via ${summary.pathSetup.updatedFiles.join(", ")}`);
  } else {
    lines.push(`PATH: could not update shell files automatically for ${summary.pathSetup.publicBinDir}.`);
  }

  for (const warning of summary.pathSetup.warnings) {
    lines.push(`Warning: ${warning}`);
  }
  for (const instruction of summary.pathSetup.manualInstructions) {
    lines.push(`Manual step: ${instruction}`);
  }
  if (summary.pathSetup.activationHint) {
    lines.push(summary.pathSetup.activationHint);
  }

  const detectedClients = summary.detectedClients.filter((client) => client.status !== "not_found");
  lines.push("");
  if (detectedClients.length > 0) {
    lines.push("Detected MCP clients:");
    for (const client of detectedClients) {
      lines.push(`  - ${titleizeClient(client.client)}: ${detectionLabel(client)}`);
    }
  } else {
    lines.push("Detected MCP clients: none");
  }

  lines.push("");
  for (const client of detectedClients) {
    lines.push(...clientConfigSection(client.client, summary.wrapperPath, summary.copySupported));
    lines.push("");
  }

  lines.push(...clientConfigSection("generic", summary.wrapperPath, summary.copySupported));
  lines.push("");
  lines.push("Broc did not modify any MCP client config files automatically.");

  return lines.join("\n");
}
