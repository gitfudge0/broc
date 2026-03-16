// ============================================================
// Messages — protocol messages between bridge, background, and content
// ============================================================

import type { Action, ActionResult } from "./actions.js";
import type { PageSnapshot } from "./snapshot.js";

// ---- Request/Response ID tracking ----

/** Every request carries a unique ID for correlation */
export interface MessageBase {
  /** Unique message ID for request/response correlation */
  id: string;
  /** Session ID (ties messages to a specific tab session) */
  sessionId: string;
}

// ---- Observe (snapshot) ----

/** Request a page snapshot */
export interface ObserveRequest extends MessageBase {
  type: "observe";
  /** Tab ID to observe (omit for active tab) */
  tabId?: number;
  /** Include screenshot as base64 data URL */
  screenshot?: boolean;
}

/** Response containing the page snapshot */
export interface ObserveResponse extends MessageBase {
  type: "observe_result";
  snapshot: PageSnapshot;
  /** Base64 screenshot data URL, if requested */
  screenshot?: string;
}

// ---- Act (execute action) ----

/** Request to execute an action */
export interface ActRequest extends MessageBase {
  type: "act";
  /** Tab ID to act on (omit for active tab) */
  tabId?: number;
  /** The action to execute */
  action: Action;
  /** Expected snapshot version — rejected if stale */
  snapshotVersion?: number;
}

/** Response from action execution */
export interface ActResponse extends MessageBase {
  type: "act_result";
  /** Result of the action */
  result: ActionResult;
  /** Fresh snapshot after the action (for mutating actions) */
  snapshot?: PageSnapshot;
}

// ---- Events (push from extension) ----

/** Navigation event */
export interface NavigationEvent {
  type: "event";
  event: "navigation";
  sessionId: string;
  tabId: number;
  url: string;
  /** Navigation type */
  navigationKind: "new" | "reload" | "back_forward" | "push_state" | "replace_state";
  timestamp: number;
}

/** DOM mutation event (debounced) */
export interface DomChangeEvent {
  type: "event";
  event: "dom_change";
  sessionId: string;
  tabId: number;
  /** New snapshot version */
  version: number;
  timestamp: number;
}

/** Dialog event (alert, confirm, prompt, beforeunload) */
export interface DialogEvent {
  type: "event";
  event: "dialog";
  sessionId: string;
  tabId: number;
  dialogType: "alert" | "confirm" | "prompt" | "beforeunload";
  message: string;
  timestamp: number;
}

/** Console error event */
export interface ConsoleErrorEvent {
  type: "event";
  event: "console_error";
  sessionId: string;
  tabId: number;
  message: string;
  source?: string;
  line?: number;
  timestamp: number;
}

/** Tab closed or navigated away */
export interface TabEvent {
  type: "event";
  event: "tab_closed" | "tab_activated";
  sessionId: string;
  tabId: number;
  timestamp: number;
}

/** Union of all push events */
export type PushEvent =
  | NavigationEvent
  | DomChangeEvent
  | DialogEvent
  | ConsoleErrorEvent
  | TabEvent;

// ---- Interrupt ----

/** Request to cancel/stop an ongoing action */
export interface InterruptRequest extends MessageBase {
  type: "interrupt";
  /** Reason for interruption */
  reason?: string;
}

/** Interrupt acknowledgement */
export interface InterruptResponse extends MessageBase {
  type: "interrupt_result";
  /** Whether the interruption was successful */
  acknowledged: boolean;
}

// ---- Error ----

/** Structured error response for any failed request */
export interface ErrorResponse extends MessageBase {
  type: "error";
  error: {
    code: ErrorCode;
    message: string;
    /** Additional context */
    details?: Record<string, unknown>;
  };
}

/** Top-level protocol error codes */
export type ErrorCode =
  | "invalid_request"
  | "tab_not_found"
  | "session_not_found"
  | "content_script_error"
  | "native_messaging_error"
  | "internal_error"
  | "not_supported"
  | "rate_limited";

// ---- Tab management ----

/** Request to list open tabs */
export interface ListTabsRequest extends MessageBase {
  type: "list_tabs";
}

/** Response with tab list */
export interface ListTabsResponse extends MessageBase {
  type: "list_tabs_result";
  tabs: TabInfo[];
}

/** Request extension capability and version status */
export interface ExtensionStatusRequest extends MessageBase {
  type: "extension_status";
}

/** Response describing the running extension protocol/capabilities */
export interface ExtensionStatusResponse extends MessageBase {
  type: "extension_status_result";
  extensionVersion: string;
  protocolVersion: number;
  capabilities: {
    openTab: boolean;
    openNotebook: boolean;
  };
}

/** Request to open a new tab */
export interface OpenTabRequest extends MessageBase {
  type: "open_tab";
  url: string;
  active?: boolean;
}

/** Response with the newly opened tab */
export interface OpenTabResponse extends MessageBase {
  type: "open_tab_result";
  tab: TabInfo;
}

/** Request to resolve a Broc notebook URL */
export interface OpenNotebookRequest extends MessageBase {
  type: "open_notebook";
  taskId?: string;
}

/** Response containing the resolved notebook URL */
export interface OpenNotebookResponse extends MessageBase {
  type: "open_notebook_result";
  url: string;
}


/** Basic tab information */
export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
}

// ---- Aggregate types ----

/** All request message types */
export type Request =
  | ObserveRequest
  | ActRequest
  | InterruptRequest
  | ListTabsRequest
  | ExtensionStatusRequest
  | OpenTabRequest
  | OpenNotebookRequest;

/** All response message types */
export type Response =
  | ObserveResponse
  | ActResponse
  | InterruptResponse
  | ListTabsResponse
  | ExtensionStatusResponse
  | OpenTabResponse
  | OpenNotebookResponse
  | ErrorResponse;

/** Any message that can be sent over the bridge */
export type BridgeMessage = Request | Response | PushEvent;
