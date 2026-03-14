export type BrowserType = "firefox" | "chrome" | "chromium";
export type McpClientType = "generic" | "claude-code" | "codex" | "opencode";
export type ClientDetectionMethod = "config" | "binary" | "directory";
export type DetectedClientStatus = "detected" | "likely_installed" | "not_found";

export const VALID_BROWSERS: BrowserType[] = ["firefox", "chrome", "chromium"];
export const VALID_MCP_CLIENTS: McpClientType[] = ["generic", "claude-code", "codex", "opencode"];

export interface DetectedClient {
  client: Exclude<McpClientType, "generic">;
  status: DetectedClientStatus;
  method: ClientDetectionMethod | null;
  evidence: string | null;
}

export interface PublicBinInstallResult {
  publicBinDir: string;
  executablePath: string;
  mode: "symlink" | "script";
  updated: boolean;
}

export interface PathSetupResult {
  publicBinDir: string;
  alreadyOnPath: boolean;
  updatedFiles: string[];
  manualInstructions: string[];
  activationHint: string | null;
  warnings: string[];
}

export interface InstallSummary {
  installVersion: string;
  installRoot: string;
  managedRuntimePath: string | null;
  wrapperPath: string;
  publicExecutablePath: string;
  pathSetup: PathSetupResult;
  detectedClients: DetectedClient[];
  copySupported: boolean;
}

export function isBrowserType(value: string): value is BrowserType {
  return VALID_BROWSERS.includes(value as BrowserType);
}

export function isMcpClientType(value: string): value is McpClientType {
  return VALID_MCP_CLIENTS.includes(value as McpClientType);
}
