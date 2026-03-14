// ============================================================
// MCP Server — exposes browser control tools for AI agents
//
// Tools:
//   browser_snapshot  — observe page, return structured snapshot
//   browser_screenshot — capture visible tab as image
//   browser_click     — click element by ref
//   browser_type      — type text into element
//   browser_press     — press keyboard key
//   browser_scroll    — scroll viewport or element
//   browser_navigate  — go to URL, back, forward, reload
//   browser_select    — select option in dropdown
//   browser_wait      — wait for element or timeout
//   browser_extract   — extract text/attribute from element
//   browser_tabs      — list open tabs
//   browser_approve   — approve or deny a pending high-risk action
// ============================================================

import { access } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BridgeClient, BridgeClientError, getPidPath, getSocketPath } from "./bridge-client.js";
import type { Action } from "../shared/types/actions.js";
import type {
  ElementContext,
  ApprovalRequest,
  ApprovalDecision,
} from "../shared/types/safety.js";
import {
  assessRisk,
  describeAction,
  RateLimiter,
  AuditLog,
} from "../shared/safety.js";
import { createNodeLogger } from "../shared/logger.js";
import { getAppPaths, getRepoPaths } from "../cli/paths.js";
import { normalizeProfilePath } from "../cli/profile-paths.js";
import { loadSetupState } from "../cli/state.js";
import {
  applyBridgePresentation,
  collectBrowserStatusReport,
  formatBrowserStatusText,
  type BridgePhase,
} from "../shared/bridge-status.js";

const log = createNodeLogger("mcp");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoPaths = getRepoPaths(__dirname);
const appPaths = getAppPaths();

// ---- Bridge setup ----

const bridge = new BridgeClient();

// ---- Safety infrastructure ----

const rateLimiter = new RateLimiter();
const auditLog = new AuditLog();

/**
 * Pending approval requests, keyed by approvalId.
 * When a high-risk action requires approval, we store it here
 * and return the approval request to the agent. The agent must
 * call browser_approve to continue.
 */
const pendingApprovals = new Map<
  string,
  {
    request: ApprovalRequest;
    action: Action;
    tabId?: number;
    resolve: (decision: ApprovalDecision) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

let nextApprovalId = 1;

/** Approval timeout in ms (2 minutes) */
const APPROVAL_TIMEOUT_MS = 120_000;
let bridgeWasConnected = false;

// ---- Snapshot formatting ----

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
}

/**
 * Format a snapshot into a compact, agent-friendly text representation.
 * Similar to Playwright's snapshot format.
 */
function formatSnapshot(snapshot: Snapshot): string {
  const lines: string[] = [];

  lines.push(`Page: ${snapshot.title}`);
  lines.push(`URL: ${snapshot.url}`);
  lines.push(`Viewport: ${snapshot.viewport.width}x${snapshot.viewport.height}`);
  lines.push(`Scroll: ${snapshot.scroll.scrollX},${snapshot.scroll.scrollY} / ${snapshot.scroll.scrollWidth}x${snapshot.scroll.scrollHeight}`);
  lines.push(`State: ${snapshot.loadingState}`);
  if (snapshot.focusedRef !== undefined) {
    lines.push(`Focused: [ref=${snapshot.focusedRef}]`);
  }
  lines.push(`Elements: ${snapshot.elements.length}${snapshot.truncated ? ` (truncated from ${snapshot.totalElements})` : ""}`);
  lines.push("");

  for (const el of snapshot.elements) {
    const indent = "  ".repeat(el.depth);
    const flags: string[] = [];

    if (el.state.clickable) flags.push("clickable");
    if (el.state.editable) flags.push("editable");
    if (!el.state.enabled) flags.push("disabled");
    if (el.state.checked) flags.push("checked");
    if (el.state.selected) flags.push("selected");
    if (el.state.expanded !== undefined) flags.push(el.state.expanded ? "expanded" : "collapsed");

    let line = `${indent}[${el.ref}] ${el.role}`;
    if (el.name) line += ` "${el.name}"`;
    if (el.value) line += ` value="${el.value}"`;
    if (el.text && el.text !== el.name) line += ` - ${el.text}`;
    if (flags.length > 0) line += ` (${flags.join(", ")})`;
    if (el.attrs?.href) line += ` → ${el.attrs.href}`;

    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Look up element context from the last snapshot for a given ref.
 * Used for risk assessment of actions that target specific elements.
 */
let lastSnapshot: Snapshot | null = null;

function getElementContext(ref: number): ElementContext | undefined {
  if (!lastSnapshot) return undefined;
  const el = lastSnapshot.elements.find((e) => e.ref === ref);
  if (!el) return undefined;
  return {
    tag: el.tag,
    role: el.role,
    name: el.name,
    text: el.text,
    attrs: el.attrs,
    type: el.attrs?.type,
  };
}

/**
 * Get the ref targeted by an action, if any.
 */
function getActionRef(action: Action): number | undefined {
  if ("ref" in action && typeof action.ref === "number") {
    return action.ref;
  }
  return undefined;
}

// ---- Bridge error handling ----

async function isBuildReady(): Promise<boolean> {
  const checks = await Promise.allSettled([
    access(repoPaths.bridgePath),
    access(repoPaths.mcpServerPath),
    access(`${repoPaths.chromeExtensionDir}/manifest.json`),
  ]);
  return checks.every((result) => result.status === "fulfilled");
}

function phaseForBridgeError(err: unknown): BridgePhase | undefined {
  if (!(err instanceof BridgeClientError)) return undefined;

  switch (err.code) {
    case "SOCKET_MISSING":
      return "socket_missing";
    case "CONNECT_FAILED":
      return "socket_unreachable";
    case "NOT_CONNECTED":
      return bridgeWasConnected ? "disconnected" : "ping_failed";
    case "DISCONNECTED":
      return "disconnected";
    case "PING_FAILED":
      return "ping_failed";
  }
}

async function collectStatusForError(err?: unknown) {
  const state = await loadSetupState(appPaths.stateFile, {
    activeWrapperPath: appPaths.wrapperPath,
    defaultManagedProfilePath: normalizeProfilePath(appPaths.profilesDir, "chromium"),
  });
  const report = await collectBrowserStatusReport({
    buildReady: await isBuildReady(),
    setupStatePresent: !!state,
    bridge: {
      socketPath: getSocketPath(),
      pidPath: getPidPath(),
      onErrorPhase: phaseForBridgeError(err),
      lastError: err instanceof Error ? err.message : undefined,
      pingBridge: async () => {
        const client = new BridgeClient({ connectTimeout: 500, timeout: 1000 });
        try {
          await client.start();
          const pong = await client.ping(1000);
          return pong.alive;
        } finally {
          client.stop();
        }
      },
    },
  });
  const phase = phaseForBridgeError(err);
  if (!phase || report.bridge.phase === "connected") {
    return report;
  }

  return {
    ...report,
    bridge: applyBridgePresentation({
      ...report.bridge,
      phase,
      lastError: err instanceof Error ? err.message : report.bridge.lastError,
    }),
  };
}

function bridgeErrorText(report: Awaited<ReturnType<typeof collectStatusForError>>): { type: "text"; text: string }[] {
  const lines = [report.bridge.summary];
  if (report.bridge.lastError) {
    lines.push(`Bridge error: ${report.bridge.lastError}`);
  }
  if (report.bridge.phase !== "connected" && report.bridge.remediation.length > 0) {
    lines.push(`Next step: ${report.bridge.remediation[0]}`);
  }
  return [{ type: "text" as const, text: lines.join("\n") }];
}

async function bridgeError(err: unknown): Promise<{ type: "text"; text: string }[]> {
  const report = await collectStatusForError(err);
  return bridgeErrorText(report);
}

async function ensureBridgeReady(): Promise<void> {
  if (!bridge.isConnected()) {
    await bridge.start();
  }

  const pong = await bridge.ping(1000);
  if (!pong.alive) {
    throw new BridgeClientError(
      "PING_FAILED",
      "Bridge health check failed.",
      { socketPath: getSocketPath(), pidPath: getPidPath() },
    );
  }

  bridgeWasConnected = true;
}

async function requestBridge(message: Record<string, unknown>): Promise<unknown> {
  await ensureBridgeReady();
  return bridge.request(message);
}

// ---- Safety-aware action execution ----

/**
 * Execute an action with full safety pipeline:
 * 1. Rate limit check
 * 2. Risk assessment
 * 3. Approval gate (if high-risk)
 * 4. Audit logging
 * 5. Execution
 * 6. Post-execution audit update
 */
async function executeActionWithSafety(
  action: Action,
  tabId?: number,
): Promise<{ type: "text"; text: string }[]> {
  // 1. Resolve element context for risk assessment
  const ref = getActionRef(action);
  const elementContext = ref !== undefined ? getElementContext(ref) : undefined;

  // 2. Assess risk
  const risk = assessRisk(action, elementContext);
  const isHighRisk = risk.level === "high";

  // 3. Rate limit check
  const rateStatus = rateLimiter.check(isHighRisk);
  if (!rateStatus.allowed) {
    return [{ type: "text" as const, text: `Rate limited: ${rateStatus.reason}. Try again in ${Math.ceil((rateStatus.resetsAt - Date.now()) / 1000)}s.` }];
  }

  // 4. Approval gate for high-risk actions
  if (risk.requiresApproval) {
    const description = describeAction(action, elementContext);
    const targetSummary = elementContext
      ? `${elementContext.role} "${elementContext.name || elementContext.text || ""}" (${elementContext.tag})`
      : undefined;

    const approvalId = `approval_${nextApprovalId++}`;
    const approvalRequest: ApprovalRequest = {
      approvalId,
      action,
      risk,
      description,
      targetSummary,
      pageUrl: lastSnapshot?.url,
      timestamp: Date.now(),
    };

    // Record in audit log as pending approval
    const auditId = auditLog.record({
      sessionId: "default",
      tabId,
      action,
      risk,
      approvalRequested: true,
      pageUrl: lastSnapshot?.url,
      snapshotVersionBefore: lastSnapshot?.version,
    });

    // Return the approval request to the agent — they must call browser_approve
    const lines: string[] = [
      `## Approval Required`,
      ``,
      `**Action:** ${description}`,
      `**Risk Level:** ${risk.level}`,
      `**Reason:** ${risk.reason}`,
    ];
    if (targetSummary) {
      lines.push(`**Target:** ${targetSummary}`);
    }
    if (risk.tags.length > 0) {
      lines.push(`**Tags:** ${risk.tags.join(", ")}`);
    }
    lines.push(``);
    lines.push(`To proceed, call \`browser_approve\` with approvalId: \`${approvalId}\` and decision: \`approve\` or \`deny\`.`);

    // Store the pending approval (action will be executed if approved)
    const approvalPromise = new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        pendingApprovals.delete(approvalId);
        resolve("timeout");
      }, APPROVAL_TIMEOUT_MS);

      pendingApprovals.set(approvalId, {
        request: approvalRequest,
        action,
        tabId,
        resolve,
        timer,
      });
    });

    // Don't await — just return the approval request
    // The agent will call browser_approve, which will resolve the promise
    // and execute the action

    return [{ type: "text" as const, text: lines.join("\n") }];
  }

  // 5. No approval needed — execute directly
  return await executeAndLog(action, risk, tabId);
}

/**
 * Execute an action and log it in the audit log.
 */
async function executeAndLog(
  action: Action,
  risk: ReturnType<typeof assessRisk>,
  tabId?: number,
): Promise<{ type: "text"; text: string }[]> {
  const startTime = Date.now();
  const isHighRisk = risk.level === "high";

  // Record in audit log
  const auditId = auditLog.record({
    sessionId: "default",
    tabId,
    action,
    risk,
    approvalRequested: false,
    pageUrl: lastSnapshot?.url,
    snapshotVersionBefore: lastSnapshot?.version,
  });

  // Record rate limit
  rateLimiter.record(isHighRisk);

  // Execute via bridge
  let response: {
    type: string;
    result?: { success: boolean; data?: string; error?: { message: string } };
    snapshot?: Snapshot;
    error?: { message: string };
  };

  try {
    response = (await requestBridge({
      type: "act",
      tabId,
      action,
    })) as typeof response;
  } catch (err) {
    return await bridgeError(err);
  }

  const durationMs = Date.now() - startTime;

  // Update snapshot cache
  if (response.snapshot) {
    lastSnapshot = response.snapshot;
  }

  // Update audit log
  auditLog.update(auditId, {
    result: response.result ? {
      success: response.result.success,
      data: response.result.data,
      error: response.result.error ? {
        code: response.result.error.message.includes("stale") ? "stale_ref" : "execution_error",
        message: response.result.error.message,
      } : undefined,
    } : undefined,
    snapshotVersionAfter: response.snapshot?.version,
    durationMs,
  });

  // Format response
  if (response.type === "error") {
    return [{ type: "text" as const, text: `Error: ${response.error?.message ?? "Unknown error"}` }];
  }

  if (!response.result?.success) {
    return [{ type: "text" as const, text: `Action failed: ${response.result?.error?.message ?? "Unknown error (no result from extension)"}` }];
  }

  return formatActionResult(action, response);
}

/**
 * Format the result of a successfully executed action.
 */
function formatActionResult(
  action: Action,
  response: {
    result?: { success: boolean; data?: string };
    snapshot?: Snapshot;
  },
): { type: "text"; text: string }[] {
  const description = describeAction(action);

  switch (action.type) {
    case "click": {
      const text = response.snapshot
        ? `Clicked element [${action.ref}]. Updated snapshot:\n\n${formatSnapshot(response.snapshot)}`
        : `Clicked element [${action.ref}].`;
      return [{ type: "text" as const, text }];
    }
    case "type": {
      const text = response.snapshot
        ? `Typed "${action.text}" into element [${action.ref}].${action.submit ? " Form submitted." : ""}\n\n${formatSnapshot(response.snapshot)}`
        : `Typed "${action.text}" into element [${action.ref}].${action.submit ? " Form submitted." : ""}`;
      return [{ type: "text" as const, text }];
    }
    case "press": {
      const text = response.snapshot
        ? `Pressed ${action.key}.\n\n${formatSnapshot(response.snapshot)}`
        : `Pressed ${action.key}.`;
      return [{ type: "text" as const, text }];
    }
    case "scroll": {
      const text = response.snapshot
        ? `Scrolled ${action.direction}.\n\n${formatSnapshot(response.snapshot)}`
        : `Scrolled ${action.direction}.`;
      return [{ type: "text" as const, text }];
    }
    case "navigate": {
      return [{ type: "text" as const, text: `Navigating to ${action.url}. Use browser_snapshot to see the result.` }];
    }
    case "select": {
      const text = response.snapshot
        ? `Selected "${action.values.join(", ")}" in element [${action.ref}].\n\n${formatSnapshot(response.snapshot)}`
        : `Selected "${action.values.join(", ")}" in element [${action.ref}].`;
      return [{ type: "text" as const, text }];
    }
    case "wait": {
      return [{ type: "text" as const, text: "Wait condition met." }];
    }
    case "extract": {
      return [{ type: "text" as const, text: response.result?.data || "" }];
    }
  }
}

// ---- MCP Server ----

const server = new McpServer({
  name: "broc",
  version: "0.1.0",
});

server.registerPrompt("browse_workflow", {
  title: "Broc Browse Workflow",
  description: "Built-in browsing guidance for Broc without any external skill file.",
}, async () => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: "Use browser_status first when browser readiness is unclear. Use browser_snapshot to inspect the page, act with the smallest safe step, and re-snapshot after every meaningful change.",
    },
  }],
}));

server.registerPrompt("browser_safety_policy", {
  title: "Broc Browser Safety Policy",
  description: "Built-in safety guidance for risky browser actions.",
}, async () => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: "Treat submissions, purchases, deletions, and downloads as high risk. Prefer inspection before action, expect approval requests for risky operations, and verify the resulting page state after approval.",
    },
  }],
}));

server.registerResource("browser-workflow-guide", "broc://guide/browser-workflow", {
  title: "Broc Browser Workflow Guide",
  description: "Operational guidance for using Broc browser tools.",
  mimeType: "text/plain",
}, async () => ({
  contents: [{
    uri: "broc://guide/browser-workflow",
    text: [
      "1. Call browser_status if runtime readiness is unclear.",
      "2. Call browser_snapshot before acting.",
      "3. Use refs from the latest snapshot for actions.",
      "4. Re-snapshot after navigation, typing, or clicks that change page state.",
      "5. Use browser_tabs to recover context if the active tab changes.",
    ].join("\n"),
  }],
}));

server.registerResource("browser-safety-guide", "broc://guide/browser-safety", {
  title: "Broc Browser Safety Guide",
  description: "Safety rules for Broc browser automation.",
  mimeType: "text/plain",
}, async () => ({
  contents: [{
    uri: "broc://guide/browser-safety",
    text: [
      "High-risk actions may require approval.",
      "Sensitive fields are redacted in snapshots and extracts.",
      "Use the smallest action that advances the task.",
      "Verify the outcome after every approved or destructive action.",
    ].join("\n"),
  }],
}));

// -- browser_snapshot --
server.tool(
  "browser_snapshot",
  "Capture a structured snapshot of the current page. Returns a text representation of all interactive elements with ref numbers that can be used for actions.",
  {
    tabId: z.number().optional().describe("Tab ID to observe (omit for active tab)"),
  },
  async ({ tabId }) => {
    let response: { type: string; snapshot?: Snapshot; error?: { message: string } };

    try {
      response = (await requestBridge({
        type: "observe",
        tabId,
      })) as typeof response;
    } catch (err) {
      return { content: await bridgeError(err) };
    }

    if (response.type === "error") {
      return { content: [{ type: "text" as const, text: `Error: ${response.error?.message ?? "Unknown error"}` }] };
    }

    // Cache snapshot for element context lookups
    if (response.snapshot) {
      lastSnapshot = response.snapshot;
    }

    const text = response.snapshot ? formatSnapshot(response.snapshot) : "No snapshot available";
    return { content: [{ type: "text" as const, text }] };
  }
);

// -- browser_screenshot --
server.tool(
  "browser_screenshot",
  "Capture a screenshot of the visible area of the current page.",
  {
    tabId: z.number().optional().describe("Tab ID to capture (omit for active tab)"),
  },
  async ({ tabId }) => {
    let response: { type: string; screenshot?: string; error?: { message: string } };

    try {
      response = (await requestBridge({
        type: "observe",
        tabId,
        screenshot: true,
      })) as typeof response;
    } catch (err) {
      return { content: await bridgeError(err) };
    }

    if (response.type === "error" || !response.screenshot) {
      return { content: [{ type: "text" as const, text: `Error: ${response.error?.message || "No screenshot returned"}` }] };
    }

    // Screenshot is a base64 data URL: data:image/png;base64,xxxxx
    if (typeof response.screenshot !== "string") {
      return { content: [{ type: "text" as const, text: "Error: Invalid screenshot data received from extension" }] };
    }

    const base64 = response.screenshot.replace(/^data:image\/\w+;base64,/, "");
    return {
      content: [{ type: "image" as const, data: base64, mimeType: "image/png" }],
    };
  }
);

// -- browser_click --
server.tool(
  "browser_click",
  "Click an element on the page by its ref number from the snapshot. High-risk clicks (purchase, delete, submit) require approval.",
  {
    ref: z.number().describe("Element ref number from the snapshot"),
    button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button (default: left)"),
    clickCount: z.number().optional().describe("Number of clicks (1 = single, 2 = double)"),
    modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).optional().describe("Modifier keys"),
  },
  async ({ ref, button, clickCount, modifiers }) => {
    const action: Action = { type: "click", ref, button, clickCount, modifiers };
    const content = await executeActionWithSafety(action);
    return { content };
  }
);

// -- browser_type --
server.tool(
  "browser_type",
  "Type text into an input element on the page. Using submit=true will submit the form (requires approval).",
  {
    ref: z.number().describe("Element ref number from the snapshot"),
    text: z.string().describe("Text to type"),
    clear: z.boolean().optional().describe("Clear the field before typing"),
    submit: z.boolean().optional().describe("Press Enter after typing to submit"),
  },
  async ({ ref, text, clear, submit }) => {
    const action: Action = { type: "type", ref, text, clear, submit };
    const content = await executeActionWithSafety(action);
    return { content };
  }
);

// -- browser_press --
server.tool(
  "browser_press",
  "Press a keyboard key (Enter, Escape, Tab, ArrowDown, etc.).",
  {
    key: z.string().describe("Key name (e.g., Enter, Escape, Tab, ArrowDown, Space)"),
    ref: z.number().optional().describe("Target element ref (default: focused element)"),
    modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).optional().describe("Modifier keys"),
  },
  async ({ key, ref, modifiers }) => {
    const action: Action = { type: "press", key, ref, modifiers };
    const content = await executeActionWithSafety(action);
    return { content };
  }
);

// -- browser_scroll --
server.tool(
  "browser_scroll",
  "Scroll the page or a specific element.",
  {
    direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
    amount: z.number().optional().describe("Scroll amount in pixels (default: ~80% of viewport)"),
    ref: z.number().optional().describe("Element ref to scroll (omit for page scroll)"),
  },
  async ({ direction, amount, ref }) => {
    const action: Action = { type: "scroll", direction, amount, ref };
    const content = await executeActionWithSafety(action);
    return { content };
  }
);

// -- browser_navigate --
server.tool(
  "browser_navigate",
  "Navigate to a URL, or go back/forward/reload.",
  {
    url: z.string().describe('URL to navigate to, or "back", "forward", "reload"'),
  },
  async ({ url }) => {
    const action: Action = { type: "navigate", url };
    const content = await executeActionWithSafety(action);
    return { content };
  }
);

// -- browser_select --
server.tool(
  "browser_select",
  "Select an option in a dropdown/select element.",
  {
    ref: z.number().describe("Element ref number for the <select> element"),
    values: z.array(z.string()).describe("Values to select"),
  },
  async ({ ref, values }) => {
    const action: Action = { type: "select", ref, values };
    const content = await executeActionWithSafety(action);
    return { content };
  }
);

// -- browser_wait --
server.tool(
  "browser_wait",
  "Wait for an element to appear/become visible, or wait a fixed time.",
  {
    ref: z.number().optional().describe("Wait for this element ref to reach the desired state"),
    selector: z.string().optional().describe("CSS selector to wait for"),
    timeout: z.number().optional().describe("Max wait time in ms (default: 5000)"),
    state: z.enum(["visible", "hidden", "attached", "detached"]).optional().describe("State to wait for (default: visible)"),
  },
  async ({ ref, selector, timeout, state }) => {
    const action: Action = { type: "wait", ref, selector, timeout, state };
    const content = await executeActionWithSafety(action);
    return { content };
  }
);

// -- browser_extract --
server.tool(
  "browser_extract",
  "Extract text content, HTML, or an attribute value from an element.",
  {
    ref: z.number().optional().describe("Element ref to extract from"),
    selector: z.string().optional().describe("CSS selector to extract from (alternative to ref)"),
    extract: z.enum(["text", "innerHTML", "outerHTML", "attribute"]).describe("What to extract"),
    attribute: z.string().optional().describe("Attribute name (required when extract is 'attribute')"),
  },
  async ({ ref, selector, extract, attribute }) => {
    const action: Action = { type: "extract", ref, selector, extract, attribute };
    const content = await executeActionWithSafety(action);
    return { content };
  }
);

// -- browser_tabs --
server.tool(
  "browser_tabs",
  "List all open browser tabs.",
  {},
  async () => {
    let response: { type: string; tabs?: Array<{ id: number; url: string; title: string; active: boolean }>; error?: { message: string } };

    try {
      response = (await requestBridge({
        type: "list_tabs",
      })) as typeof response;
    } catch (err) {
      return { content: await bridgeError(err) };
    }

    if (response.type === "error") {
      return { content: [{ type: "text" as const, text: `Error: ${response.error?.message ?? "Unknown error"}` }] };
    }

    const tabs = response.tabs || [];
    const lines = tabs.map(
      (t) => `${t.active ? "→ " : "  "}[${t.id}] ${t.title}\n    ${t.url}`
    );

    return {
      content: [{ type: "text" as const, text: lines.length > 0 ? lines.join("\n") : "No tabs found. The browser may not have any tabs open, or the extension may not be loaded." }],
    };
  }
);

// -- browser_approve --
server.tool(
  "browser_approve",
  "Approve or deny a pending high-risk action. Required when an action triggers the approval gate.",
  {
    approvalId: z.string().describe("The approvalId from the approval request"),
    decision: z.enum(["approve", "deny"]).describe("Whether to approve or deny the action"),
  },
  async ({ approvalId, decision }) => {
    const pending = pendingApprovals.get(approvalId);

    if (!pending) {
      return {
        content: [{
          type: "text" as const,
          text: `No pending approval found for ID: ${approvalId}. It may have expired or already been resolved.`,
        }],
      };
    }

    // Resolve the approval
    clearTimeout(pending.timer);
    pendingApprovals.delete(approvalId);

    if (decision === "deny") {
      // Log the denial
      auditLog.record({
        sessionId: "default",
        tabId: pending.tabId,
        action: pending.action,
        risk: pending.request.risk,
        approvalRequested: true,
        approval: {
          approvalId,
          decision: "deny",
          decidedBy: "agent",
          timestamp: Date.now(),
        },
        pageUrl: pending.request.pageUrl,
      });

      return {
        content: [{
          type: "text" as const,
          text: `Action denied: ${pending.request.description}`,
        }],
      };
    }

    // Approved — execute the action
    const content = await executeAndLog(
      pending.action,
      pending.request.risk,
      pending.tabId,
    );

    return { content };
  }
);

// -- browser_status --
server.tool(
  "browser_status",
  "Report browser automation health, including whether the bridge is connected and ready for browser control.",
  {},
  async () => {
    const report = await collectStatusForError();
    return {
      content: [{
        type: "text" as const,
        text: `${formatBrowserStatusText(report)}\n\n${JSON.stringify(report, null, 2)}`,
      }],
    };
  }
);

// -- browser_audit_log --
server.tool(
  "browser_audit_log",
  "View the recent action audit log. Shows all actions attempted, their risk levels, and results.",
  {
    count: z.number().optional().describe("Number of recent entries to return (default: 20)"),
    sessionId: z.string().optional().describe("Filter by session ID"),
  },
  async ({ count, sessionId }) => {
    const entries = auditLog.getRecent(count || 20, sessionId ? { sessionId } : undefined);

    if (entries.length === 0) {
      return { content: [{ type: "text" as const, text: "No audit log entries." }] };
    }

    const lines: string[] = [`## Audit Log (${entries.length} entries)\n`];

    for (const entry of entries) {
      const time = new Date(entry.timestamp).toISOString();
      const status = entry.result
        ? entry.result.success ? "OK" : "FAILED"
        : entry.approvalRequested ? "PENDING_APPROVAL" : "NO_RESULT";
      const riskStr = `[${entry.risk.level}${entry.risk.tags.length ? `: ${entry.risk.tags.join(",")}` : ""}]`;

      lines.push(`${time} ${status} ${riskStr} ${describeAction(entry.action)}`);
      if (entry.result?.error) {
        lines.push(`  Error: ${entry.result.error.message}`);
      }
      if (entry.durationMs !== undefined) {
        lines.push(`  Duration: ${entry.durationMs}ms`);
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ---- Start server ----

async function main(): Promise<void> {
  // Connect MCP server via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  try {
    await ensureBridgeReady();
    log.info("Bridge connected; MCP server running on stdio");
  } catch (error) {
    const report = await collectStatusForError(error);
    log.warn(`${report.bridge.summary} MCP server running in degraded mode.`);
  }
}

main().catch((error) => {
  log.error("Fatal error:", error);
  process.exit(1);
});
