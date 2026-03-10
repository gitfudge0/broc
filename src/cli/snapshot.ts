import { BridgeClient, BridgeClientError, getPidPath, getSocketPath } from "../mcp/bridge-client.js";
import { collectBridgeStatus } from "../shared/bridge-status.js";

const isTTY = process.stdout.isTTY ?? false;

const c = {
  reset: isTTY ? "\x1b[0m" : "",
  bold: isTTY ? "\x1b[1m" : "",
  dim: isTTY ? "\x1b[2m" : "",
  cyan: isTTY ? "\x1b[36m" : "",
  green: isTTY ? "\x1b[32m" : "",
  yellow: isTTY ? "\x1b[33m" : "",
  red: isTTY ? "\x1b[31m" : "",
  magenta: isTTY ? "\x1b[35m" : "",
  blue: isTTY ? "\x1b[34m" : "",
  gray: isTTY ? "\x1b[90m" : "",
  white: isTTY ? "\x1b[37m" : "",
  bgBlue: isTTY ? "\x1b[44m" : "",
};

interface SnapshotElement {
  ref: number;
  tag: string;
  role: string;
  name: string;
  text?: string;
  value?: string;
  state: {
    visible: boolean;
    enabled: boolean;
    clickable: boolean;
    editable: boolean;
    focusable: boolean;
    checked?: boolean;
    selected?: boolean;
    expanded?: boolean;
  };
  depth: number;
  attrs?: Record<string, string>;
  bounds?: { x: number; y: number; width: number; height: number };
  locators?: {
    role?: { role: string; name?: string };
    label?: string;
    placeholder?: string;
    text?: string;
    alt?: string;
    title?: string;
    testId?: string;
    css?: string;
  };
}

interface Snapshot {
  version: number;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scroll: { scrollX: number; scrollY: number; scrollWidth: number; scrollHeight: number };
  loadingState: string;
  focusedRef?: number;
  elements: SnapshotElement[];
  truncated: boolean;
  totalElements: number;
  frames?: Array<{ id: string; url: string; isMain: boolean; sameOrigin: boolean }>;
  timestamp?: number;
}

function formatSnapshotForTerminal(snapshot: Snapshot, options: { verbose?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`${c.bold}${c.bgBlue}${c.white} SNAPSHOT ${c.reset}  ${c.bold}${snapshot.title}${c.reset}`);
  lines.push(`${c.cyan}URL:${c.reset}      ${snapshot.url}`);
  lines.push(`${c.cyan}Viewport:${c.reset} ${snapshot.viewport.width}x${snapshot.viewport.height}`);

  const scrollPct = snapshot.scroll.scrollHeight > 0
    ? Math.round((snapshot.scroll.scrollY / (snapshot.scroll.scrollHeight - snapshot.viewport.height)) * 100) || 0
    : 0;
  lines.push(`${c.cyan}Scroll:${c.reset}   ${snapshot.scroll.scrollX},${snapshot.scroll.scrollY} / ${snapshot.scroll.scrollWidth}x${snapshot.scroll.scrollHeight} ${c.dim}(${scrollPct}% down)${c.reset}`);

  const stateColor = snapshot.loadingState === "complete" ? c.green
    : snapshot.loadingState === "loading" ? c.yellow
    : c.cyan;
  lines.push(`${c.cyan}State:${c.reset}    ${stateColor}${snapshot.loadingState}${c.reset}`);

  if (snapshot.focusedRef !== undefined) {
    lines.push(`${c.cyan}Focused:${c.reset}  ${c.yellow}[ref=${snapshot.focusedRef}]${c.reset}`);
  }

  if (snapshot.frames && snapshot.frames.length > 1) {
    lines.push(`${c.cyan}Frames:${c.reset}   ${snapshot.frames.length}`);
    for (const frame of snapshot.frames) {
      const origin = frame.sameOrigin ? c.green + "same-origin" : c.red + "cross-origin";
      lines.push(`  ${frame.isMain ? "main" : frame.id}: ${frame.url} ${c.dim}(${origin}${c.reset}${c.dim})${c.reset}`);
    }
  }

  const countStr = snapshot.truncated
    ? `${c.yellow}${snapshot.elements.length} shown / ${snapshot.totalElements} total (truncated)${c.reset}`
    : `${snapshot.elements.length}`;
  lines.push(`${c.cyan}Elements:${c.reset} ${countStr}`);
  if (snapshot.timestamp) {
    lines.push(`${c.cyan}Captured:${c.reset} ${new Date(snapshot.timestamp).toLocaleTimeString()}`);
  }
  lines.push(`${c.cyan}Version:${c.reset}  ${snapshot.version}`);
  lines.push("");

  let clickableCount = 0;
  let editableCount = 0;
  let disabledCount = 0;
  for (const el of snapshot.elements) {
    if (el.state.clickable) clickableCount++;
    if (el.state.editable) editableCount++;
    if (!el.state.enabled) disabledCount++;
  }
  lines.push(`${c.dim}--- ${clickableCount} clickable, ${editableCount} editable, ${disabledCount} disabled ---${c.reset}`);
  lines.push("");

  for (const el of snapshot.elements) {
    const indent = "  ".repeat(el.depth);
    const refStr = `${c.yellow}[${el.ref}]${c.reset}`;
    let roleColor = c.dim;
    if (el.state.clickable) roleColor = c.green;
    if (el.state.editable) roleColor = c.cyan;
    if (!el.state.enabled) roleColor = c.red;
    const roleStr = `${roleColor}${el.role}${c.reset}`;
    const nameStr = el.name ? ` ${c.bold}"${el.name}"${c.reset}` : "";
    const valueStr = el.value ? ` ${c.magenta}value="${el.value}"${c.reset}` : "";
    const textStr = el.text && el.text !== el.name
      ? ` ${c.dim}- ${el.text.length > 60 ? el.text.slice(0, 57) + "..." : el.text}${c.reset}`
      : "";
    const flags: string[] = [];
    if (el.state.clickable) flags.push(`${c.green}clickable${c.reset}`);
    if (el.state.editable) flags.push(`${c.cyan}editable${c.reset}`);
    if (!el.state.enabled) flags.push(`${c.red}disabled${c.reset}`);
    if (el.state.checked) flags.push(`${c.green}checked${c.reset}`);
    if (el.state.selected) flags.push(`${c.green}selected${c.reset}`);
    if (el.state.expanded !== undefined) {
      flags.push(el.state.expanded ? `${c.blue}expanded${c.reset}` : `${c.dim}collapsed${c.reset}`);
    }
    const flagStr = flags.length > 0 ? ` (${flags.join(", ")})` : "";
    const hrefStr = el.attrs?.href ? ` ${c.blue}-> ${el.attrs.href}${c.reset}` : "";
    const tagStr = options.verbose ? ` ${c.dim}<${el.tag}>${c.reset}` : "";
    const boundsStr = options.verbose && el.bounds
      ? ` ${c.dim}@${Math.round(el.bounds.x)},${Math.round(el.bounds.y)} ${Math.round(el.bounds.width)}x${Math.round(el.bounds.height)}${c.reset}`
      : "";

    lines.push(`${indent}${refStr} ${roleStr}${nameStr}${valueStr}${textStr}${flagStr}${hrefStr}${tagStr}${boundsStr}`);

    if (options.verbose && el.locators) {
      const locStrs: string[] = [];
      if (el.locators.role) {
        locStrs.push(`role=${el.locators.role.role}${el.locators.role.name ? `[${el.locators.role.name}]` : ""}`);
      }
      if (el.locators.label) locStrs.push(`label="${el.locators.label}"`);
      if (el.locators.testId) locStrs.push(`testid="${el.locators.testId}"`);
      if (el.locators.css) locStrs.push(`css="${el.locators.css}"`);
      if (locStrs.length > 0) {
        lines.push(`${indent}  ${c.dim}locators: ${locStrs.join(" | ")}${c.reset}`);
      }
    }
  }

  return lines.join("\n");
}

export async function snapshotCommand(argv: string[]): Promise<void> {
  const verbose = argv.includes("--verbose") || argv.includes("-v");
  const jsonOutput = argv.includes("--json");
  const tabIdArg = argv.find((arg) => arg.startsWith("--tab="));
  const tabId = tabIdArg ? parseInt(tabIdArg.split("=")[1], 10) : undefined;
  const bridge = new BridgeClient();

  try {
    await bridge.start();

    const pong = await bridge.ping(5000);
    if (!pong.alive) {
      console.error("Error: Could not connect to the bridge. Is the browser extension loaded?");
      process.exit(1);
    }

    const response = (await bridge.request({
      type: "observe",
      tabId,
    })) as { type: string; snapshot?: Snapshot; error?: { message: string } };

    if (response.type === "error") {
      console.error(`Error: ${response.error?.message || "Unknown error"}`);
      process.exit(1);
    }

    if (!response.snapshot) {
      console.error("Error: No snapshot returned. Is there an active tab?");
      process.exit(1);
    }

    if (jsonOutput) {
      console.log(JSON.stringify(response.snapshot, null, 2));
    } else {
      console.log(formatSnapshotForTerminal(response.snapshot, { verbose }));
    }
  } catch (err) {
    const onErrorPhase = err instanceof BridgeClientError
      ? err.code === "CONNECT_FAILED"
        ? "socket_unreachable"
        : err.code === "DISCONNECTED"
          ? "disconnected"
          : err.code === "PING_FAILED" || err.code === "NOT_CONNECTED"
            ? "ping_failed"
            : undefined
      : undefined;
    const report = await collectBridgeStatus({
      socketPath: getSocketPath(),
      pidPath: getPidPath(),
      onErrorPhase,
      lastError: err instanceof Error ? err.message : String(err),
    });
    console.error(`Error: ${report.summary}`);
    if (report.lastError) {
      console.error(`Bridge error: ${report.lastError}`);
    }
    for (const entry of report.remediation) {
      if (entry === "No action required.") continue;
      console.error(`Next step: ${entry}`);
    }
    process.exit(1);
  } finally {
    bridge.stop();
  }
}
