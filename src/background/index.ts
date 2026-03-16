// ============================================================
// Background script — orchestrator
// Coordinates content scripts, native messaging bridge, and tab sessions.
//
// Firefox MV3: event pages (non-persistent). Chrome MV3: service workers.
// Both require all listeners to be registered synchronously at the
// top level. State is persisted to storage.session.
// ============================================================

import type {
  Request,
  Response,
  ObserveRequest,
  ObserveResponse,
  ActRequest,
  ActResponse,
  ListTabsRequest,
  ListTabsResponse,
  ExtensionStatusRequest,
  ExtensionStatusResponse,
  OpenTabRequest,
  InterruptRequest,
  InterruptResponse,
  ErrorResponse,
  PushEvent,
  TabInfo,
} from "../shared/index.js";
import { createExtensionLogger, initExtensionDebug } from "../shared/logger.js";
import {
  handleExtensionStatusRequest,
  handleOpenTabRequest,
  makeProtocolError,
} from "./bridge-requests.js";

const log = createExtensionLogger("bg");
initExtensionDebug(log).catch(() => {});

// ---- Session management ----

interface TabSession {
  tabId: number;
  sessionId: string;
  contentScriptReady: boolean;
  snapshotVersion: number;
}

/** In-memory session registry (rebuilt from storage.session on wake) */
const sessions = new Map<string, TabSession>();

/** Generate a unique session ID */
function generateSessionId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get or create a session for a tab.
 */
async function getOrCreateSession(tabId: number): Promise<TabSession> {
  // Check if we already have a session for this tab
  for (const session of sessions.values()) {
    if (session.tabId === tabId) return session;
  }

  const sessionId = generateSessionId();
  const session: TabSession = {
    tabId,
    sessionId,
    contentScriptReady: false,
    snapshotVersion: 0,
  };
  sessions.set(sessionId, session);

  // Persist to storage.session
  await persistSessions();

  return session;
}

async function persistSessions(): Promise<void> {
  const data: Record<string, TabSession> = {};
  for (const [id, session] of sessions) {
    data[id] = session;
  }
  await browser.storage.session.set({ sessions: data });
}

async function restoreSessions(): Promise<void> {
  const stored = await browser.storage.session.get("sessions");
  const data = stored.sessions as Record<string, TabSession> | undefined;
  if (data) {
    sessions.clear();
    for (const [id, session] of Object.entries(data)) {
      // Mark content scripts as not ready (we don't know if they survived)
      session.contentScriptReady = false;
      sessions.set(id, session);
    }
  }
}

// ---- Permission / URL checks ----

/**
 * Restricted URL patterns where content scripts cannot be injected.
 * Includes patterns for both Firefox and Chrome/Chromium — patterns
 * for one browser simply won't match URLs from the other.
 */
const RESTRICTED_URL_PATTERNS = [
  // Shared
  /^about:/,
  /^data:/,
  /^view-source:/,

  // Firefox-specific
  /^moz-extension:/,
  /^resource:/,
  /^jar:/,
  /^https?:\/\/addons\.mozilla\.org\//,
  /^https?:\/\/discovery\.addons\.mozilla\.org\//,
  /^https?:\/\/accounts\.firefox\.com\//,
  /^https?:\/\/content\.cdn\.mozilla\.net\//,
  /^https?:\/\/support\.mozilla\.org\//,
  /^https?:\/\/install\.mozilla\.org\//,
  /^about:reader/,
  /^moz-extension:\/\/.*\/pdfjs\//,

  // Chrome/Chromium-specific
  /^chrome:/,
  /^chrome-extension:/,
  /^https?:\/\/chromewebstore\.google\.com\//,
  /^https?:\/\/chrome\.google\.com\/webstore\//,
  /^https?:\/\/clients\d*\.google\.com\//,
  /^https?:\/\/accounts\.google\.com\//,
];

/**
 * Check whether the tab URL allows content script injection.
 * Firefox silently blocks injection on restricted URLs; we pre-check
 * to provide a clear error message instead.
 */
async function checkTabPermission(tabId: number): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const tab = await browser.tabs.get(tabId);
    const url = tab.url || "";

    if (!url || url === "about:blank") {
      return { allowed: true };
    }

    for (const pattern of RESTRICTED_URL_PATTERNS) {
      if (pattern.test(url)) {
        return {
          allowed: false,
          reason: `Cannot inject into restricted URL: ${url}. The browser blocks extension scripts on this page.`,
        };
      }
    }

    return { allowed: true };
  } catch {
    // tabs.get failed — tab may not exist
    return { allowed: false, reason: `Tab ${tabId} not found or not accessible.` };
  }
}

// ---- Content script injection ----

/** Maximum retries for content script injection */
const MAX_INJECT_RETRIES = 3;
const INJECT_RETRY_DELAY_MS = 500;

/**
 * Ensure the content script is injected and ready in a tab.
 * Includes retry logic for transient failures.
 */
async function ensureContentScript(tabId: number, retries = MAX_INJECT_RETRIES): Promise<void> {
  // Pre-check: verify the tab URL is not restricted
  const perm = await checkTabPermission(tabId);
  if (!perm.allowed) {
    throw new Error(perm.reason || `Cannot inject content script into tab ${tabId}`);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Try to ping the content script first
      try {
        const response = await browser.tabs.sendMessage(tabId, { type: "ping" }) as { pong?: boolean };
        if (response?.pong) {
          // Content script is already there
          const session = await getOrCreateSession(tabId);
          session.contentScriptReady = true;
          return;
        }
      } catch {
        // Content script not loaded yet — inject it
      }

      // Inject the content script
      await browser.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });

      // Verify injection
      try {
        const response = await browser.tabs.sendMessage(tabId, { type: "ping" }) as { pong?: boolean };
        if (response?.pong) {
          const session = await getOrCreateSession(tabId);
          session.contentScriptReady = true;
          return;
        }
      } catch {
        // Failed to verify — will retry
      }
    } catch (err) {
      // Injection failed (tab might be loading, restricted, etc.)
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, INJECT_RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw new Error(
        `Failed to inject content script into tab ${tabId} after ${retries + 1} attempts: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  throw new Error(`Failed to inject content script into tab ${tabId}`);
}

// ---- Active tab resolution ----

/**
 * Get the active tab ID, or use the provided tab ID.
 */
async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId !== undefined) return tabId;

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0 || tabs[0].id === undefined) {
    throw new Error("No active tab found");
  }
  return tabs[0].id;
}

// ---- Message routing ----

/**
 * Handle an observe request: inject content script, capture snapshot.
 */
async function handleObserve(req: ObserveRequest): Promise<ObserveResponse | ErrorResponse> {
  try {
    const tabId = await resolveTabId(req.tabId);
    await ensureContentScript(tabId);

    const response = await browser.tabs.sendMessage(tabId, { type: "snapshot" }) as {
      success: boolean;
      snapshot?: unknown;
      pendingDialog?: unknown;
      error?: { code: string; message: string };
    };

    if (!response.success) {
      return makeError(req, "content_script_error", response.error?.message || "Snapshot failed");
    }

    let screenshot: string | undefined;
    if (req.screenshot) {
      try {
        screenshot = await browser.tabs.captureVisibleTab(undefined, {
          format: "png",
        });
      } catch (err) {
        // Screenshot failure shouldn't fail the observe
        log.warn("Screenshot failed:", err);
      }
    }

    return {
      type: "observe_result",
      id: req.id,
      sessionId: req.sessionId,
      snapshot: response.snapshot as ObserveResponse["snapshot"],
      screenshot,
    };
  } catch (err) {
    return makeError(req, "internal_error", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Handle an act request: inject content script, execute action.
 */
async function handleAct(req: ActRequest): Promise<ActResponse | ErrorResponse> {
  try {
    const tabId = await resolveTabId(req.tabId);
    await ensureContentScript(tabId);

    const response = await browser.tabs.sendMessage(tabId, {
      type: "action",
      action: req.action,
    }) as {
      success: boolean;
      data?: string;
      error?: { code: string; message: string; ref?: number };
      snapshot?: unknown;
      scrollTriggeredNewContent?: boolean;
    };

    return {
      type: "act_result",
      id: req.id,
      sessionId: req.sessionId,
      result: {
        success: response.success,
        data: response.data,
        error: response.error ? {
          code: response.error.code as ActResponse["result"]["error"] extends { code: infer C } ? C : never,
          message: response.error.message,
          ref: response.error.ref,
        } : undefined,
      },
      snapshot: response.snapshot as ActResponse["snapshot"],
    };
  } catch (err) {
    // Error recovery: if the content script died mid-action, try to reinject
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes("Could not establish connection") || errorMsg.includes("Receiving end does not exist")) {
      try {
        const tabId = await resolveTabId(req.tabId);
        const session = await getOrCreateSession(tabId);
        session.contentScriptReady = false;
        // Return a stale_ref error so the agent knows to re-snapshot
        return {
          type: "act_result",
          id: req.id,
          sessionId: req.sessionId,
          result: {
            success: false,
            error: {
              code: "stale_ref" as ActResponse["result"]["error"] extends { code: infer C } ? C : never,
              message: "Content script disconnected. Take a new snapshot before retrying.",
            },
          },
        };
      } catch {
        // Fall through to generic error
      }
    }
    return makeError(req, "internal_error", errorMsg);
  }
}

/**
 * Handle a list tabs request.
 */
async function handleListTabs(req: ListTabsRequest): Promise<ListTabsResponse> {
  const allTabs = await browser.tabs.query({});
  const tabInfos: TabInfo[] = allTabs
    .filter((t) => t.id !== undefined)
    .map((t) => ({
      id: t.id!,
      url: t.url || "",
      title: t.title || "",
      active: t.active,
      windowId: t.windowId,
    }));

  return {
    type: "list_tabs_result",
    id: req.id,
    sessionId: req.sessionId,
    tabs: tabInfos,
  };
}

/**
 * Handle a request to open a new browser tab.
 */
async function handleOpenTab(req: OpenTabRequest): Promise<Response> {
  return handleOpenTabRequest(req, {
    createTab: async (options) => browser.tabs.create(options),
  });
}

function handleExtensionStatus(req: ExtensionStatusRequest): ExtensionStatusResponse {
  return handleExtensionStatusRequest(req, {
    getManifestVersion: () => browser.runtime.getManifest().version,
  });
}

/**
 * Handle an interrupt request.
 */
function handleInterrupt(req: InterruptRequest): InterruptResponse {
  // For now, just acknowledge — cancellation of in-flight actions
  // will be implemented when we add async action tracking
  return {
    type: "interrupt_result",
    id: req.id,
    sessionId: req.sessionId,
    acknowledged: true,
  };
}

function makeError(
  req: { id: string; sessionId: string },
  code: string,
  message: string
): ErrorResponse {
  return makeProtocolError(req, code as ErrorResponse["error"]["code"], message);
}

// ---- Native messaging bridge ----

let bridgePort: browser.runtime.Port | null = null;
let messageQueue: unknown[] = [];
let nextBridgeRequestId = 1;
const pendingBridgeRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const BRIDGE_REQUEST_TIMEOUT_MS = 5000;

/**
 * Send a message to the native host bridge.
 * Queues messages if the bridge is not connected.
 */
function sendToBridge(message: Response | PushEvent): void {
  if (bridgePort) {
    try {
      bridgePort.postMessage(message);
      return;
    } catch {
      bridgePort = null;
    }
  }
  // Queue for when bridge reconnects
  messageQueue.push(message);
}

function isBridgeResponseMessage(message: unknown): message is { id: string; type: string; sessionId?: string } {
  if (!message || typeof message !== "object") return false;
  const value = message as Record<string, unknown>;
  return typeof value.id === "string" && typeof value.type === "string" && pendingBridgeRequests.has(value.id);
}

function requestBridge(message: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!bridgePort) {
      reject(new Error("Bridge is not connected."));
      return;
    }

    const id = `ext_${nextBridgeRequestId++}`;
    const timer = setTimeout(() => {
      pendingBridgeRequests.delete(id);
      reject(new Error(`Bridge request timed out after ${BRIDGE_REQUEST_TIMEOUT_MS}ms.`));
    }, BRIDGE_REQUEST_TIMEOUT_MS);

    pendingBridgeRequests.set(id, { resolve, reject, timer });

    try {
      bridgePort.postMessage({ ...message, id, sessionId: "extension" });
    } catch (error) {
      clearTimeout(timer);
      pendingBridgeRequests.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Handle incoming messages from the native host bridge.
 */
async function handleBridgeMessage(message: unknown): Promise<void> {
  if (isBridgeResponseMessage(message)) {
    const pending = pendingBridgeRequests.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingBridgeRequests.delete(message.id);
    pending.resolve(message);
    return;
  }

  const req = message as Request;

  if (!req || !req.type || !req.id) {
    log.warn("Invalid bridge message:", message);
    return;
  }

  let response: Response;

  switch (req.type) {
    case "observe":
      response = await handleObserve(req as ObserveRequest);
      break;
    case "act":
      response = await handleAct(req as ActRequest);
      break;
    case "list_tabs":
      response = await handleListTabs(req as ListTabsRequest);
      break;
    case "extension_status":
      response = handleExtensionStatus(req as ExtensionStatusRequest);
      break;
    case "open_tab":
      response = await handleOpenTab(req as OpenTabRequest);
      break;
    case "interrupt":
      response = handleInterrupt(req as InterruptRequest);
      break;
    default:
      response = makeError(
        { id: (message as { id: string }).id, sessionId: (message as { sessionId?: string }).sessionId || "" },
        "invalid_request",
        `Unknown request type: ${(message as { type: string }).type}`
      );
  }

  sendToBridge(response);
}

/**
 * Connect to the native messaging host.
 * Automatically reconnects on disconnect with exponential backoff.
 */
function connectBridge(): void {
  try {
    bridgePort = browser.runtime.connectNative("broc");

    bridgePort.onMessage.addListener((message: unknown) => {
      handleBridgeMessage(message).catch((err) => {
        log.error("Error handling bridge message:", err);
      });
    });

    bridgePort.onDisconnect.addListener(() => {
      log.info("Bridge disconnected");
      bridgePort = null;
      for (const [id, pending] of pendingBridgeRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Bridge disconnected."));
        pendingBridgeRequests.delete(id);
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        // Exponential backoff with jitter
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts) + Math.random() * 500,
          MAX_RECONNECT_DELAY_MS
        );
        reconnectAttempts++;
        log.info(`Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        setTimeout(connectBridge, delay);
      } else {
        log.error("Max reconnect attempts reached. Bridge is disconnected.");
      }
    });

    // Flush queued messages
    const queue = messageQueue;
    messageQueue = [];
    for (const msg of queue) {
      bridgePort.postMessage(msg);
    }

    // Reset reconnect counter on successful connection
    reconnectAttempts = 0;
    log.info("Bridge connected");
  } catch (err) {
    log.warn("Failed to connect to native host:", err);
    bridgePort = null;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY_MS
      );
      reconnectAttempts++;
      setTimeout(connectBridge, delay);
    }
  }
}

// ---- Content script event listener (SPA nav, dialogs, mutations) ----

browser.runtime.onMessage.addListener(
  (message: unknown, sender: browser.runtime.MessageSender) => {
    const msg = message as { type: string; [key: string]: unknown };
    if (!msg?.type || !sender.tab?.id) return;

    const tabId = sender.tab.id;

    switch (msg.type) {
      case "spa_navigation": {
        // Content script detected a pushState/replaceState/popstate
        const event: PushEvent = {
          type: "event",
          event: "navigation",
          sessionId: "",
          tabId,
          url: msg.url as string,
          navigationKind: mapSPANavigationKind(msg.navigationKind as string),
          timestamp: msg.timestamp as number,
        };

        for (const session of sessions.values()) {
          if (session.tabId === tabId) {
            event.sessionId = session.sessionId;
            session.snapshotVersion++;
            // Content script is still alive for SPA navigations
            break;
          }
        }

        sendToBridge(event);
        break;
      }

      case "dialog_event": {
        // Content script intercepted a dialog
        const event: PushEvent = {
          type: "event",
          event: "dialog",
          sessionId: "",
          tabId,
          dialogType: msg.dialogType as "alert" | "confirm" | "prompt" | "beforeunload",
          message: msg.message as string,
          timestamp: msg.timestamp as number,
        };

        for (const session of sessions.values()) {
          if (session.tabId === tabId) {
            event.sessionId = session.sessionId;
            break;
          }
        }

        sendToBridge(event);
        break;
      }

      case "dom_mutation": {
        // Content script detected significant DOM mutations
        const event: PushEvent = {
          type: "event",
          event: "dom_change",
          sessionId: "",
          tabId,
          version: msg.snapshotVersion as number,
          timestamp: msg.timestamp as number,
        };

        for (const session of sessions.values()) {
          if (session.tabId === tabId) {
            event.sessionId = session.sessionId;
            session.snapshotVersion = msg.snapshotVersion as number;
            break;
          }
        }

        sendToBridge(event);
        break;
      }
    }
  }
);

function mapSPANavigationKind(kind: string): "push_state" | "replace_state" | "back_forward" {
  switch (kind) {
    case "push_state":
      return "push_state";
    case "replace_state":
      return "replace_state";
    case "pop_state":
      return "back_forward";
    default:
      return "push_state";
  }
}

// ---- Event listeners (must be registered synchronously at top level) ----

// Navigation events
browser.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // Only main frame

  const event: PushEvent = {
    type: "event",
    event: "navigation",
    sessionId: "", // Will be filled if we have a session
    tabId: details.tabId,
    url: details.url,
    navigationKind: mapTransitionType(details.transitionType),
    timestamp: details.timeStamp,
  };

  // Find session for this tab and set sessionId
  for (const session of sessions.values()) {
    if (session.tabId === details.tabId) {
      event.sessionId = session.sessionId;
      session.contentScriptReady = false; // Content script is gone after navigation
      session.snapshotVersion++;
      break;
    }
  }

  sendToBridge(event);
});

function mapTransitionType(type?: string): "new" | "reload" | "back_forward" | "push_state" | "replace_state" {
  switch (type) {
    case "reload":
      return "reload";
    case "auto_subframe":
    case "manual_subframe":
      return "new";
    default:
      return "new";
  }
}

// Tab events
browser.action.onClicked.addListener(async () => {
  try {
    if (!bridgePort) {
      throw new Error("Broc runtime is not connected. Launch Broc first.");
    }

    const response = await requestBridge({ type: "open_notebook" }) as { type: string; url?: string; error?: { message?: string } };

    if (response.type === "open_notebook_result" && typeof response.url === "string") {
      await browser.tabs.create({ url: response.url, active: true });
      return;
    }

    await browser.tabs.create({
      url: `data:text/plain,${encodeURIComponent(response.error?.message || "Could not open the notebook.")}`,
      active: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await browser.tabs.create({
      url: `data:text/plain,${encodeURIComponent(message)}`,
      active: true,
    });
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  const event: PushEvent = {
    type: "event",
    event: "tab_activated",
    sessionId: "",
    tabId: activeInfo.tabId,
    timestamp: Date.now(),
  };

  for (const session of sessions.values()) {
    if (session.tabId === activeInfo.tabId) {
      event.sessionId = session.sessionId;
      break;
    }
  }

  sendToBridge(event);
});

browser.tabs.onRemoved.addListener((tabId) => {
  // Clean up session for removed tab
  for (const [sessionId, session] of sessions) {
    if (session.tabId === tabId) {
      sessions.delete(sessionId);

      sendToBridge({
        type: "event",
        event: "tab_closed",
        sessionId,
        tabId,
        timestamp: Date.now(),
      });
      break;
    }
  }
  persistSessions().catch((e) => log.error("Failed to persist sessions:", e));
});

// Event page lifecycle
browser.runtime.onSuspend.addListener(() => {
  log.info("Event page suspending, persisting state...");
  persistSessions().catch((e) => log.error("Failed to persist sessions:", e));
});

// ---- Initialization ----

// Restore sessions from storage.session (event page may have been suspended)
restoreSessions()
  .then(() => {
    log.info(`Restored ${sessions.size} sessions`);
  })
  .catch((e) => log.error("Failed to restore sessions:", e));

// Connect to native host bridge
connectBridge();

log.info("Background script loaded");
