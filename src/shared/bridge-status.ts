import { existsSync, readFileSync } from "fs";

export type BridgePhase =
  | "connected"
  | "socket_missing"
  | "pid_missing"
  | "pid_stale"
  | "socket_unreachable"
  | "ping_failed"
  | "disconnected";

export interface BridgeStatusReport {
  phase: BridgePhase;
  summary: string;
  socketPath: string;
  pidPath: string;
  pid?: number;
  pidAlive: boolean;
  socketExists: boolean;
  pingAlive: boolean;
  lastError?: string;
  remediation: string[];
  extensionVersion?: string;
  protocolVersion?: number;
  capabilities?: {
    openTab: boolean;
  };
  extensionCompatibility?: "current" | "stale_or_unknown";
}

export interface BrowserStatusReport {
  buildReady: boolean;
  setupStatePresent: boolean;
  bridge: BridgeStatusReport;
}

export interface CollectBridgeStatusOptions {
  socketPath: string;
  pidPath: string;
  socketExists?: (path: string) => boolean;
  readPidFile?: (path: string) => string;
  isPidAlive?: (pid: number) => boolean;
  pingBridge?: () => Promise<boolean>;
  onErrorPhase?: BridgePhase;
  lastError?: string;
}

export interface CollectBrowserStatusOptions {
  buildReady: boolean;
  setupStatePresent: boolean;
  bridge: CollectBridgeStatusOptions;
}

function defaultSocketExists(path: string): boolean {
  return existsSync(path);
}

function defaultReadPidFile(path: string): string {
  return readFileSync(path, "utf-8");
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parsePid(contents: string | null): number | undefined {
  if (!contents) return undefined;
  const pid = parseInt(contents.trim(), 10);
  return Number.isNaN(pid) ? undefined : pid;
}

export function formatBridgeSummary(report: BridgeStatusReport): string {
  switch (report.phase) {
    case "connected":
      return "Browser automation is available. The bridge socket is reachable and responding to health checks.";
    case "pid_missing":
      return "Browser automation is unavailable. No bridge process or socket was found.";
    case "pid_stale":
      return "Browser automation is unavailable. The bridge PID file is stale and the recorded process is no longer running.";
    case "socket_missing":
      return "Browser automation is unavailable. The bridge process is present, but its socket is missing.";
    case "socket_unreachable":
      return "Browser automation is unavailable. The bridge socket exists, but the CLI could not connect to it.";
    case "ping_failed":
      return "Browser automation is unavailable. The bridge socket accepted a connection, but health checks did not succeed.";
    case "disconnected":
      return "Browser automation became unavailable after the bridge disconnected.";
  }
}

export function formatBridgeRemediation(report: BridgeStatusReport): string[] {
  switch (report.phase) {
    case "connected":
      return ["No action required."];
    case "pid_missing":
      return ["Launch the managed browser session with 'broc launch --browser=<name>'."];
    case "pid_stale":
      return [
        "Relaunch the managed browser session with 'broc launch --browser=<name>'.",
        "If the stale PID file persists, remove the bridge state under /tmp/broc-<uid>.* and try again.",
      ];
    case "socket_missing":
      return ["Relaunch the managed browser session so the browser extension can recreate the bridge socket."];
    case "socket_unreachable":
      return ["Relaunch the managed browser session. The bridge socket exists, but the extension bridge is not accepting connections."];
    case "ping_failed":
      return ["Relaunch the managed browser session. The extension bridge is running, but it is not healthy yet."];
    case "disconnected":
      return ["Relaunch the managed browser session. The bridge disconnected after startup."];
  }
}

export function applyBridgePresentation(
  base: Omit<BridgeStatusReport, "summary" | "remediation">,
): BridgeStatusReport {
  const report: BridgeStatusReport = {
    ...base,
    summary: "",
    remediation: [],
  };
  report.summary = formatBridgeSummary(report);
  report.remediation = formatBridgeRemediation(report);
  return report;
}

export async function collectBridgeStatus(options: CollectBridgeStatusOptions): Promise<BridgeStatusReport> {
  const socketExists = (options.socketExists ?? defaultSocketExists)(options.socketPath);

  let pid: number | undefined;
  try {
    pid = parsePid((options.readPidFile ?? defaultReadPidFile)(options.pidPath));
  } catch {
    pid = undefined;
  }

  const pidAlive = pid !== undefined && (options.isPidAlive ?? defaultIsPidAlive)(pid);

  if (!socketExists) {
    if (pid !== undefined && !pidAlive) {
      return applyBridgePresentation({
        phase: "pid_stale",
        socketPath: options.socketPath,
        pidPath: options.pidPath,
        pid,
        pidAlive,
        socketExists,
        pingAlive: false,
        lastError: options.lastError,
      });
    }

    return applyBridgePresentation({
      phase: pid === undefined ? "pid_missing" : "socket_missing",
      socketPath: options.socketPath,
      pidPath: options.pidPath,
      pid,
      pidAlive,
      socketExists,
      pingAlive: false,
      lastError: options.lastError,
    });
  }

  try {
    const pingAlive = await (options.pingBridge?.() ?? Promise.resolve(false));
    return applyBridgePresentation({
      phase: pingAlive ? "connected" : (options.onErrorPhase ?? "ping_failed"),
      socketPath: options.socketPath,
      pidPath: options.pidPath,
      pid,
      pidAlive,
      socketExists,
      pingAlive,
      lastError: pingAlive ? undefined : options.lastError,
    });
  } catch (error) {
    return applyBridgePresentation({
      phase: options.onErrorPhase ?? "socket_unreachable",
      socketPath: options.socketPath,
      pidPath: options.pidPath,
      pid,
      pidAlive,
      socketExists,
      pingAlive: false,
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function collectBrowserStatusReport(
  options: CollectBrowserStatusOptions,
): Promise<BrowserStatusReport> {
  return {
    buildReady: options.buildReady,
    setupStatePresent: options.setupStatePresent,
    bridge: await collectBridgeStatus(options.bridge),
  };
}

export function formatBrowserStatusText(report: BrowserStatusReport): string {
  const lines = [
    report.bridge.summary,
    `Bridge phase: ${report.bridge.phase}`,
    `Build artifacts: ${report.buildReady ? "ready" : "missing"}`,
    `Setup state: ${report.setupStatePresent ? "present" : "not set up"}`,
    `Socket path: ${report.bridge.socketPath}`,
    `PID path: ${report.bridge.pidPath}`,
  ];

  if (report.bridge.lastError) {
    lines.push(`Last error: ${report.bridge.lastError}`);
  }

  if (report.bridge.remediation.length > 0 && report.bridge.phase !== "connected") {
    lines.push("");
    lines.push("Next step:");
    for (const entry of report.bridge.remediation) {
      lines.push(`- ${entry}`);
    }
  }

  return lines.join("\n");
}
