// ============================================================
// Content script entry point
// Handles messages from the background script and dispatches
// to the snapshot engine and action executor.
//
// Also hooks SPA navigation, dialogs, and DOM mutations.
// ============================================================

import { captureSnapshot, resolveRef, incrementSnapshotVersion, getSnapshotVersion } from "./snapshot.js";
import { executeAction } from "./actions.js";
import type { Action } from "../shared/types/actions.js";

// ---- Dialog interception ----

/**
 * Track pending dialogs that the agent hasn't handled yet.
 * Stores the most recent dialog info.
 */
interface PendingDialog {
  dialogType: "alert" | "confirm" | "prompt" | "beforeunload";
  message: string;
  timestamp: number;
  /** Default value for prompt dialogs */
  defaultValue?: string;
}

let pendingDialog: PendingDialog | null = null;

/**
 * Intercept native dialogs (alert, confirm, prompt).
 * Store dialog info so the agent can see them, and auto-dismiss with defaults.
 */
const originalAlert = window.alert;
const originalConfirm = window.confirm;
const originalPrompt = window.prompt;

window.alert = function (message?: string): void {
  const dialog: PendingDialog = {
    dialogType: "alert",
    message: message ?? "",
    timestamp: Date.now(),
  };
  pendingDialog = dialog;

  // Notify the background script about the dialog
  notifyDialog(dialog);

  // Don't block — just record it
  // Original alert would block, but we want the agent to handle it
};

window.confirm = function (message?: string): boolean {
  const dialog: PendingDialog = {
    dialogType: "confirm",
    message: message ?? "",
    timestamp: Date.now(),
  };
  pendingDialog = dialog;
  notifyDialog(dialog);

  // Default: deny confirms to prevent unintended actions
  return false;
};

window.prompt = function (message?: string, defaultValue?: string): string | null {
  const dialog: PendingDialog = {
    dialogType: "prompt",
    message: message ?? "",
    defaultValue: defaultValue ?? undefined,
    timestamp: Date.now(),
  };
  pendingDialog = dialog;
  notifyDialog(dialog);

  // Default: cancel prompts
  return null;
};

/**
 * Listen for beforeunload events.
 */
window.addEventListener("beforeunload", (event) => {
  const dialog: PendingDialog = {
    dialogType: "beforeunload",
    message: event.returnValue || "Are you sure you want to leave?",
    timestamp: Date.now(),
  };
  pendingDialog = dialog;
  notifyDialog(dialog);
});

function notifyDialog(dialog: PendingDialog): void {
  try {
    browser.runtime.sendMessage({
      type: "dialog_event",
      dialogType: dialog.dialogType,
      message: dialog.message,
      defaultValue: dialog.defaultValue,
      timestamp: dialog.timestamp,
    }).catch(() => {
      // Background might not be listening — that's OK
    });
  } catch {
    // Extension context may be invalid
  }
}

// ---- SPA navigation detection ----

let lastUrl = window.location.href;

/**
 * Monkey-patch history.pushState and replaceState to detect SPA navigations.
 */
const originalPushState = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

history.pushState = function (...args: Parameters<typeof History.prototype.pushState>) {
  const result = originalPushState(...args);
  onSPANavigation("push_state");
  return result;
};

history.replaceState = function (...args: Parameters<typeof History.prototype.replaceState>) {
  const result = originalReplaceState(...args);
  onSPANavigation("replace_state");
  return result;
};

/**
 * Also listen for popstate (browser back/forward buttons).
 */
window.addEventListener("popstate", () => {
  onSPANavigation("pop_state");
});

function onSPANavigation(kind: string): void {
  const newUrl = window.location.href;
  if (newUrl !== lastUrl) {
    lastUrl = newUrl;
    incrementSnapshotVersion(); // Invalidate current snapshot

    try {
      browser.runtime.sendMessage({
        type: "spa_navigation",
        url: newUrl,
        navigationKind: kind,
        timestamp: Date.now(),
      }).catch(() => {});
    } catch {
      // Extension context may be invalid
    }
  }
}

// ---- DOM Mutation Observer (debounced) ----

let mutationObserver: MutationObserver | null = null;
let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let significantMutationCount = 0;

/** Minimum mutations before we consider it "significant" */
const MUTATION_THRESHOLD = 5;
/** Debounce delay in ms */
const MUTATION_DEBOUNCE_MS = 500;

function startMutationObserver(): void {
  if (mutationObserver) return;

  mutationObserver = new MutationObserver((mutations) => {
    // Count significant mutations (not just text changes in the same node)
    let significant = 0;
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        significant += mutation.addedNodes.length + mutation.removedNodes.length;
      } else if (mutation.type === "attributes") {
        // Attribute changes on interactive elements are significant
        const target = mutation.target as HTMLElement;
        if (target.tagName && isInteractiveTag(target.tagName.toLowerCase())) {
          significant++;
        }
      }
    }

    significantMutationCount += significant;

    // Debounce notification
    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
    }

    mutationDebounceTimer = setTimeout(() => {
      if (significantMutationCount >= MUTATION_THRESHOLD) {
        incrementSnapshotVersion(); // Invalidate stale refs
        try {
          browser.runtime.sendMessage({
            type: "dom_mutation",
            mutationCount: significantMutationCount,
            snapshotVersion: getSnapshotVersion(),
            timestamp: Date.now(),
          }).catch(() => {});
        } catch {
          // Extension context may be invalid
        }
      }
      significantMutationCount = 0;
    }, MUTATION_DEBOUNCE_MS);
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "disabled", "aria-hidden", "aria-expanded", "aria-selected", "value"],
  });
}

function isInteractiveTag(tag: string): boolean {
  return ["input", "button", "select", "textarea", "a", "details", "summary", "dialog"].includes(tag);
}

// Start observing after a short delay to avoid initial load noise
setTimeout(startMutationObserver, 1000);

// ---- Infinite scroll / lazy loading detection ----

let lastScrollHeight = document.documentElement.scrollHeight;
let scrollWatcher: ReturnType<typeof setTimeout> | null = null;

/**
 * After scroll actions, check if new content was loaded.
 * This is called from the action executor post-scroll.
 */
export function checkScrollTriggeredContent(): boolean {
  const newScrollHeight = document.documentElement.scrollHeight;
  if (newScrollHeight > lastScrollHeight + 100) {
    lastScrollHeight = newScrollHeight;
    return true; // New content was loaded
  }
  return false;
}

// ---- Message listener ----

/**
 * Listen for messages from the background script.
 * The background script sends requests, and we respond with results.
 *
 * Returns `true` from the listener to indicate async response via sendResponse.
 */
browser.runtime.onMessage.addListener(
  (message: unknown, _sender: browser.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    const msg = message as { type: string; [key: string]: unknown };

    switch (msg.type) {
      case "snapshot": {
        try {
          const snapshot = captureSnapshot();
          // Include pending dialog info if any
          const extras: Record<string, unknown> = {};
          if (pendingDialog) {
            extras.pendingDialog = { ...pendingDialog };
            pendingDialog = null; // Clear after reporting
          }
          sendResponse({ success: true, snapshot, ...extras });
        } catch (err) {
          sendResponse({
            success: false,
            error: {
              code: "content_script_error",
              message: err instanceof Error ? err.message : String(err),
            },
          });
        }
        return true;
      }

      case "action": {
        const action = msg.action as Action;
        if (!action || !action.type) {
          sendResponse({
            success: false,
            error: { code: "invalid_action", message: "Missing or invalid action" },
          });
          return true;
        }

        // Execute action (may be async for wait actions)
        executeAction(action)
          .then((result) => {
            // For mutating actions, include a fresh snapshot
            const mutating = ["click", "type", "press", "scroll", "select", "navigate"].includes(action.type);
            let snapshot;
            if (mutating && result.success) {
              try {
                snapshot = captureSnapshot();
              } catch {
                // Snapshot capture failure shouldn't fail the action
              }
            }

            // Check for scroll-triggered content loading
            let scrollTriggeredNewContent = false;
            if (action.type === "scroll" && result.success) {
              scrollTriggeredNewContent = checkScrollTriggeredContent();
            }

            sendResponse({ ...result, snapshot, scrollTriggeredNewContent });
          })
          .catch((err) => {
            sendResponse({
              success: false,
              error: {
                code: "execution_error",
                message: err instanceof Error ? err.message : String(err),
              },
            });
          });
        return true;
      }

      case "resolve_ref": {
        const ref = msg.ref as number;
        const el = resolveRef(ref);
        sendResponse({
          success: el !== null,
          found: el !== null,
          tag: el?.tagName?.toLowerCase(),
        });
        return true;
      }

      case "dismiss_dialog": {
        // Allow the agent to retroactively set dialog responses
        // (dialog was already auto-dismissed, but we acknowledge the request)
        const dialog = pendingDialog;
        pendingDialog = null;
        sendResponse({
          success: true,
          dialog: dialog ? { ...dialog } : null,
          dismissed: dialog !== null,
        });
        return true;
      }

      case "set_file": {
        // Handle file upload by setting files on a file input
        const ref = msg.ref as number;
        const filePath = msg.filePath as string;
        const el = resolveRef(ref);
        if (!el || !(el instanceof HTMLInputElement) || el.type !== "file") {
          sendResponse({
            success: false,
            error: { code: "not_interactable", message: "Element is not a file input" },
          });
          return true;
        }
        // Note: Content scripts cannot directly set files on file inputs
        // due to security restrictions. The best we can do is trigger
        // a click to open the file dialog. Actual file setting requires
        // the File API or testutils which are not available in production.
        sendResponse({
          success: false,
          error: {
            code: "not_supported",
            message: "File upload requires manual interaction. Content scripts cannot programmatically set files on file inputs due to browser security restrictions.",
          },
        });
        return true;
      }

      case "ping": {
        sendResponse({ success: true, pong: true });
        return true;
      }

      default:
        return false;
    }
  }
);

console.log("[browser-control] Content script loaded");
