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
import { dirname, resolve } from "path";
import { spawn } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BridgeClient, BridgeClientError, getPidPath, getSocketPath, requestNotebookUrl } from "./bridge-client.js";
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
import type { BrowserType } from "../cli/types.js";
import {
  applyBridgePresentation,
  collectBrowserStatusReport,
  formatBrowserStatusText,
  type BridgePhase,
} from "../shared/bridge-status.js";
import {
  addNotebookArtifact,
  appendNotebookEvent,
  createNotebookTask,
  ensureNotebookStore,
  listNotebookTasks,
  loadNotebookTask,
  setNotebookView,
  updateNotebookMeta,
} from "../notebook/store.js";
import { getNotebookUrl } from "../notebook/server.js";
import { TaskBindingRegistry } from "../notebook/task-bindings.js";
import type { NotebookView } from "../notebook/types.js";
import type { AuditEntry } from "../shared/types/safety.js";

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
let bridgeAutostartPromise: Promise<void> | null = null;
let lastSessionId = "default";
let lastTabId: number | undefined;
const notebookTaskBindings = new TaskBindingRegistry();

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
  sessionId?: string;
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

function getCurrentSessionId(): string {
  return lastSessionId;
}

async function findLinkedNotebookTask(params: { sessionId?: string; tabId?: number }): Promise<{ meta: { id: string } } | null> {
  const taskId = notebookTaskBindings.resolve(params);
  return taskId ? loadNotebookTask(appPaths, taskId).catch(() => null) : null;
}

function bindNotebookTask(taskId: string, params: { sessionId?: string; tabId?: number }): void {
  notebookTaskBindings.bind(taskId, params);
}

async function hydrateNotebookTaskBindings(): Promise<void> {
  const tasks = await listNotebookTasks(appPaths);
  const bindings = await Promise.all(tasks.map(async (task) => {
    const record = await loadNotebookTask(appPaths, task.id).catch(() => null);
    if (!record) return null;
    return {
      taskId: record.meta.id,
      sessionId: record.meta.sessionId,
      tabId: record.meta.tabId,
    };
  }));
  notebookTaskBindings.seed(bindings.filter((binding): binding is NonNullable<typeof binding> => !!binding));
}

function summarizeActionTarget(action: Action): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if ("ref" in action && typeof action.ref === "number") payload.ref = action.ref;
  if (action.type === "navigate") payload.url = action.url;
  if (action.type === "type") {
    payload.textLength = action.text.length;
    if (action.clear !== undefined) payload.clear = action.clear;
    if (action.submit !== undefined) payload.submit = action.submit;
  }
  if (action.type === "press") payload.key = action.key;
  if (action.type === "scroll") {
    payload.direction = action.direction;
    if (action.amount !== undefined) payload.amount = action.amount;
  }
  if (action.type === "select") payload.values = action.values;
  if (action.type === "wait") {
    if (action.selector) payload.selector = action.selector;
    if (action.timeout !== undefined) payload.timeout = action.timeout;
    if (action.state) payload.state = action.state;
  }
  if (action.type === "extract") {
    payload.extract = action.extract;
    if (action.selector) payload.selector = action.selector;
    if (action.attribute) payload.attribute = action.attribute;
  }
  return payload;
}

async function appendBrowserActionEvent(params: {
  action: Action;
  tabId?: number;
  sessionId?: string;
  phase: "requested" | "completed" | "failed" | "approval_requested" | "approved" | "denied";
  risk?: ReturnType<typeof assessRisk>;
  durationMs?: number;
  result?: { success: boolean; data?: string; error?: { message?: string; code?: string } };
  approvalId?: string;
  snapshot?: Snapshot | null;
}): Promise<void> {
  const linked = await findLinkedNotebookTask({ sessionId: params.sessionId, tabId: params.tabId });
  if (!linked) return;

  const snapshot = params.snapshot || lastSnapshot;
  const payload: Record<string, unknown> = {
    phase: params.phase,
    actionType: params.action.type,
    tabId: params.tabId,
    sessionId: params.sessionId,
    pageUrl: snapshot?.url,
    pageTitle: snapshot?.title,
    snapshotVersion: snapshot?.version,
    description: describeAction(params.action, getActionRef(params.action) !== undefined ? getElementContext(getActionRef(params.action)!) : undefined),
    ...summarizeActionTarget(params.action),
  };

  if (params.risk) {
    payload.riskLevel = params.risk.level;
    payload.riskTags = params.risk.tags;
  }
  if (params.durationMs !== undefined) payload.durationMs = params.durationMs;
  if (params.approvalId) payload.approvalId = params.approvalId;
  if (params.result) {
    payload.success = params.result.success;
    if (params.result.data !== undefined) payload.data = params.result.data;
    if (params.result.error?.message) payload.error = params.result.error.message;
    if (params.result.error?.code) payload.errorCode = params.result.error.code;
  }

  await appendNotebookEvent(appPaths, linked.meta.id, {
    type: `browser.action.${params.phase}`,
    actor: "system",
    payload,
  }).catch(() => {});
}

async function mirrorAuditEntryToNotebook(entry: AuditEntry, phase: "approval_requested" | "completed" | "failed"): Promise<void> {
  await appendBrowserActionEvent({
    action: entry.action,
    tabId: entry.tabId,
    sessionId: entry.sessionId,
    phase,
    risk: entry.risk,
    durationMs: entry.durationMs,
    result: entry.result,
    snapshot: lastSnapshot,
  });
}

function tryJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function openNotebookWindow(taskId?: string): Promise<string> {
  await ensureBridgeReadyForRequest({ allowAutostart: true });
  let url: string;
  try {
    url = await requestNotebookUrl({ taskId });
  } catch {
    url = await getNotebookUrl({ appPaths, repoPaths, taskId });
  }

  const response = await requestBridge({ type: "open_tab", url, active: true }) as { type: string; tab?: { id: number } };
  if (response.type !== "open_tab_result") {
    throw new Error("Could not open notebook tab.");
  }
  return url;
}

function summarizeNotebookTask(task: Awaited<ReturnType<typeof loadNotebookTask>>): string {
  const lines = [
    `${task.meta.title} [${task.meta.status}]`,
    `Task ID: ${task.meta.id}`,
    `Updated: ${task.meta.updatedAt}`,
  ];
  if (task.view.summary) {
    lines.push(`Summary: ${task.view.summary}`);
  }
  if (task.meta.artifacts.length > 0) {
    lines.push(`Artifacts: ${task.meta.artifacts.length}`);
  }
  return lines.join("\n");
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
  await ensureBridgeReadyForRequest({ allowAutostart: false });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectAndPingBridge(): Promise<void> {
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

function selectAutostartBrowser(state: Awaited<ReturnType<typeof loadSetupState>>): BrowserType | null {
  if (!state) return null;

  if (state.browsers.chromium) return "chromium";
  if (state.browsers.chrome) return "chrome";
  if (state.browsers.firefox) return "firefox";
  return null;
}

function shouldAttemptAutostart(error: unknown): boolean {
  if (!(error instanceof BridgeClientError)) {
    return false;
  }

  return error.code === "SOCKET_MISSING"
    || error.code === "CONNECT_FAILED"
    || error.code === "NOT_CONNECTED";
}

async function waitForBridgeAfterAutostart(timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const client = new BridgeClient({ connectTimeout: 500, timeout: 1000 });
    try {
      await client.start();
      const pong = await client.ping(1000);
      if (pong.alive) {
        return;
      }
    } catch {
      // Ignore transient startup failures while the browser and extension come up.
    } finally {
      client.stop();
    }

    await sleep(200);
  }

  throw new BridgeClientError(
    "PING_FAILED",
    "Managed browser launch did not make the bridge ready in time.",
    { socketPath: getSocketPath(), pidPath: getPidPath() },
  );
}

async function autostartBrowserForRequest(): Promise<void> {
  if (bridgeAutostartPromise) {
    return bridgeAutostartPromise;
  }

  bridgeAutostartPromise = (async () => {
    const state = await loadSetupState(appPaths.stateFile, {
      activeWrapperPath: appPaths.wrapperPath,
      defaultManagedProfilePath: normalizeProfilePath(appPaths.profilesDir, "chromium"),
    });
    const browser = selectAutostartBrowser(state);

    if (!state || !browser) {
      throw new Error("No prepared Broc browser runtime is available. Run './scripts/install.sh' first.");
    }

    const isRepoDevState = state.installRoot === repoPaths.repoRoot && state.dist.root === repoPaths.distDir;
    const command = isRepoDevState ? process.execPath : state.activeWrapperPath;
    const args = isRepoDevState
      ? [repoPaths.cliPath, "launch", `--browser=${browser}`, "--no-mcp"]
      : ["launch", `--browser=${browser}`, "--no-mcp"];

    const child = spawn(command, args, {
      cwd: repoPaths.repoRoot,
      env: { ...process.env },
      stdio: "ignore",
      detached: true,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      child.once("spawn", () => {
        settled = true;
        resolve();
      });

      child.once("error", (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.once("exit", (code) => {
        if (!settled && code !== null && code !== 0) {
          settled = true;
          reject(new Error(`Browser autostart exited before startup completed (code ${code}).`));
        }
      });
    });

    child.unref();
    await waitForBridgeAfterAutostart();
  })().finally(() => {
    bridgeAutostartPromise = null;
  });

  return bridgeAutostartPromise;
}

async function ensureBridgeReadyForRequest(options: { allowAutostart: boolean }): Promise<void> {
  if (options.allowAutostart && !bridge.isConnected()) {
    const report = await collectStatusForError();
    if (report.bridge.phase !== "connected" && report.bridge.phase !== "socket_unreachable" && report.bridge.phase !== "ping_failed" && report.bridge.phase !== "disconnected") {
      await autostartBrowserForRequest();
    }
  }

  try {
    await connectAndPingBridge();
  } catch (error) {
    if (!options.allowAutostart || !shouldAttemptAutostart(error)) {
      throw error;
    }

    bridge.stop();
    await autostartBrowserForRequest();
    await connectAndPingBridge();
  }
}

async function requestBridge(message: Record<string, unknown>): Promise<unknown> {
  await ensureBridgeReadyForRequest({ allowAutostart: true });
  return bridge.request(message);
}

function rememberBrowserContext(params: { sessionId?: string; tabId?: number }): void {
  if (params.sessionId) lastSessionId = params.sessionId;
  if (params.tabId !== undefined) lastTabId = params.tabId;
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
      sessionId: getCurrentSessionId(),
      tabId,
      action,
      risk,
      approvalRequested: true,
      pageUrl: lastSnapshot?.url,
      snapshotVersionBefore: lastSnapshot?.version,
    });

    // Return the approval request to the agent — they must call browser_approve
    await appendBrowserActionEvent({
      action,
      tabId,
      sessionId: getCurrentSessionId(),
      phase: "approval_requested",
      risk,
      approvalId,
      snapshot: lastSnapshot,
    });

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
    sessionId: getCurrentSessionId(),
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
    sessionId?: string;
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

  rememberBrowserContext({ sessionId: response.sessionId, tabId });

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

  const auditEntry = auditLog.getRecent(1).find((entry) => entry.entryId === auditId);
  if (auditEntry) {
    await mirrorAuditEntryToNotebook(
      auditEntry,
      auditEntry.result?.success ? "completed" : "failed",
    );
  }

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
    let response: { type: string; sessionId?: string; snapshot?: Snapshot; error?: { message: string } };

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
    rememberBrowserContext({ sessionId: response.sessionId, tabId });

    const linked = await findLinkedNotebookTask({ sessionId: response.sessionId, tabId });
    if (linked && response.snapshot) {
      await appendNotebookEvent(appPaths, linked.meta.id, {
        type: "browser.observation.snapshot",
        actor: "system",
        payload: {
          pageUrl: response.snapshot.url,
          pageTitle: response.snapshot.title,
          tabId,
          sessionId: response.sessionId,
          snapshotVersion: response.snapshot.version,
          elementCount: response.snapshot.elements.length,
          totalElements: response.snapshot.totalElements,
        },
      }).catch(() => {});
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
    let response: { type: string; sessionId?: string; screenshot?: string; snapshot?: Snapshot; error?: { message: string } };

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
    rememberBrowserContext({ sessionId: response.sessionId, tabId });

    const linked = await findLinkedNotebookTask({ sessionId: response.sessionId, tabId });
    if (linked) {
      await appendNotebookEvent(appPaths, linked.meta.id, {
        type: "browser.observation.screenshot",
        actor: "system",
        payload: {
          tabId,
          sessionId: response.sessionId,
          pageUrl: lastSnapshot?.url,
          pageTitle: lastSnapshot?.title,
        },
      }).catch(() => {});

      // Auto-save screenshot as a notebook artifact
      const screenshotName = `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      await addNotebookArtifact(appPaths, linked.meta.id, {
        kind: "screenshot",
        name: screenshotName,
        mimeType: "image/png",
        extension: ".png",
        base64Content: base64,
      }).catch(() => {});
    }

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
    const linked = await findLinkedNotebookTask({ sessionId: getCurrentSessionId(), tabId: lastTabId });
    if (linked) {
      await appendNotebookEvent(appPaths, linked.meta.id, {
        type: "browser.observation.tabs",
        actor: "system",
        payload: {
          sessionId: getCurrentSessionId(),
          tabCount: tabs.length,
          activeTabId: tabs.find((tab) => tab.active)?.id,
        },
      }).catch(() => {});
    }

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
      const deniedId = auditLog.record({
        sessionId: getCurrentSessionId(),
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

      const denied = auditLog.getRecent(1).find((entry) => entry.entryId === deniedId);
      if (denied) {
        await appendBrowserActionEvent({
          action: denied.action,
          tabId: denied.tabId,
          sessionId: denied.sessionId,
          phase: "denied",
          risk: denied.risk,
          approvalId,
          snapshot: lastSnapshot,
        });
      }

      return {
        content: [{
          type: "text" as const,
          text: `Action denied: ${pending.request.description}`,
        }],
      };
    }

    // Approved — execute the action
    await appendBrowserActionEvent({
      action: pending.action,
      tabId: pending.tabId,
      sessionId: getCurrentSessionId(),
      phase: "approved",
      risk: pending.request.risk,
      approvalId,
      snapshot: lastSnapshot,
    });

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
    const linked = await findLinkedNotebookTask({ sessionId: getCurrentSessionId(), tabId: lastTabId });
    if (linked) {
      await appendNotebookEvent(appPaths, linked.meta.id, {
        type: "browser.observation.status",
        actor: "system",
        payload: {
          sessionId: getCurrentSessionId(),
          bridgePhase: report.bridge.phase,
          buildReady: report.buildReady,
          setupStatePresent: report.setupStatePresent,
          summary: formatBrowserStatusText(report).split("\n")[0],
        },
      }).catch(() => {});
    }

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

server.tool(
  "notebook_create",
  "Create a persistent task notebook for a long-running task.",
  {
    id: z.string().optional().describe("Optional stable task ID"),
    title: z.string().describe("Human-readable task title"),
    goal: z.string().optional().describe("Initial goal or summary"),
    tags: z.array(z.string()).optional().describe("Optional task tags"),
    sessionId: z.string().optional().describe("Optional linked browser session ID"),
    tabId: z.number().optional().describe("Optional linked browser tab ID"),
    open: z.boolean().optional().describe("Open the notebook UI after creation"),
  },
  async ({ id, title, goal, tags, sessionId, tabId, open }) => {
    await ensureNotebookStore(appPaths);
    const task = await createNotebookTask(appPaths, { id, title, goal, tags, sessionId, tabId });
    bindNotebookTask(task.meta.id, { sessionId: task.meta.sessionId, tabId: task.meta.tabId });
    if (open) {
      await openNotebookWindow(task.meta.id).catch(() => {});
    }
    return {
      content: [{
        type: "text" as const,
        text: `Created notebook ${task.meta.id}\n\n${summarizeNotebookTask(task)}`,
      }],
    };
  }
);

server.tool(
  "notebook_update",
  "Update persistent notebook metadata such as title, status, tags, or linked browser context.",
  {
    taskId: z.string().describe("Notebook task ID"),
    title: z.string().optional().describe("Updated title"),
    status: z.enum(["pending", "running", "waiting", "blocked", "completed", "failed", "archived"]).optional().describe("Updated task status"),
    tags: z.array(z.string()).optional().describe("Updated tags"),
    sessionId: z.string().optional().describe("Linked browser session ID"),
    tabId: z.number().optional().describe("Linked browser tab ID"),
  },
  async ({ taskId, title, status, tags, sessionId, tabId }) => {
    const meta = await updateNotebookMeta(appPaths, taskId, { title, status, tags, sessionId, tabId });
    bindNotebookTask(meta.id, { sessionId: meta.sessionId, tabId: meta.tabId });
    return { content: [{ type: "text" as const, text: `Updated notebook ${meta.id} [${meta.status}]` }] };
  }
);

server.tool(
  "notebook_set_view",
  "Write or merge the notebook view for a task.",
  {
    taskId: z.string().describe("Notebook task ID"),
    merge: z.boolean().optional().describe("Merge into the current view instead of replacing it"),
    view: z.string().describe("JSON object string for the notebook view"),
  },
  async ({ taskId, merge, view }) => {
    const value = tryJsonParse<NotebookView>(view, {});
    const next = await setNotebookView(appPaths, taskId, { merge, value });
    return { content: [{ type: "text" as const, text: `Updated notebook view for ${taskId}\n\n${JSON.stringify(next, null, 2)}` }] };
  }
);

server.tool(
  "notebook_append_event",
  "Append a timeline event to a notebook task.",
  {
    taskId: z.string().describe("Notebook task ID"),
    type: z.string().describe("Event type"),
    actor: z.enum(["agent", "system", "user"]).optional().describe("Event actor"),
    payload: z.string().optional().describe("Optional JSON object string payload"),
  },
  async ({ taskId, type, actor, payload }) => {
    const event = await appendNotebookEvent(appPaths, taskId, {
      type,
      actor,
      payload: payload ? tryJsonParse<Record<string, unknown>>(payload, {}) : {},
    });
    return { content: [{ type: "text" as const, text: `Appended event ${event.type} to ${taskId}` }] };
  }
);

server.tool(
  "notebook_add_artifact",
  "Attach a persistent artifact to a notebook task from text, base64, or an existing file path.",
  {
    taskId: z.string().describe("Notebook task ID"),
    kind: z.string().describe("Artifact kind, such as screenshot, extract, or file"),
    name: z.string().describe("Artifact display name"),
    mimeType: z.string().optional().describe("Artifact mime type"),
    extension: z.string().optional().describe("Preferred file extension"),
    sourcePath: z.string().optional().describe("Existing absolute file path to copy"),
    textContent: z.string().optional().describe("Text content to save as an artifact"),
    base64Content: z.string().optional().describe("Base64 content to save as a binary artifact"),
  },
  async ({ taskId, kind, name, mimeType, extension, sourcePath, textContent, base64Content }) => {
    const artifact = await addNotebookArtifact(appPaths, taskId, {
      kind,
      name,
      mimeType,
      extension,
      sourcePath,
      textContent,
      base64Content,
    });
    return { content: [{ type: "text" as const, text: `Added artifact ${artifact.name} to ${taskId}` }] };
  }
);

server.tool(
  "notebook_get",
  "Read a notebook task and optionally include its event timeline.",
  {
    taskId: z.string().describe("Notebook task ID"),
    includeEvents: z.boolean().optional().describe("Include the event timeline"),
  },
  async ({ taskId, includeEvents }) => {
    const task = await loadNotebookTask(appPaths, taskId, { includeEvents });
    return { content: [{ type: "text" as const, text: JSON.stringify(task, null, 2) }] };
  }
);

server.tool(
  "notebook_list",
  "List all persistent notebook tasks.",
  {},
  async () => {
    const tasks = await listNotebookTasks(appPaths);
    const lines = tasks.map((task) => `[${task.status}] ${task.title} (${task.id})`).join("\n");
    return { content: [{ type: "text" as const, text: lines || "No notebook tasks found." }] };
  }
);

server.tool(
  "notebook_open",
  "Open the notebook UI in the managed browser, optionally focused on a task.",
  {
    taskId: z.string().optional().describe("Notebook task ID to focus"),
  },
  async ({ taskId }) => {
    const url = await openNotebookWindow(taskId);
    return { content: [{ type: "text" as const, text: `Opened notebook UI at ${url}` }] };
  }
);

// ---- Start server ----

async function main(): Promise<void> {
  await ensureNotebookStore(appPaths);
  await hydrateNotebookTaskBindings();
  bridge.onEvent((message) => {
    const event = message as { event?: string; sessionId?: string; tabId?: number; url?: string; type?: string };
    const sessionId = event.sessionId;
    if (event.type !== "event" || !sessionId) return;
    void (async () => {
      rememberBrowserContext({ sessionId, tabId: event.tabId });
      const linked = await findLinkedNotebookTask({ sessionId, tabId: event.tabId });
      if (!linked) return;
      await appendNotebookEvent(appPaths, linked.meta.id, {
        type: "browser.event_linked",
        actor: "system",
        payload: event as unknown as Record<string, unknown>,
      }).catch(() => {});
    })();
  });

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
