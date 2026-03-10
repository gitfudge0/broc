// ============================================================
// Action executor — typed action primitives on the page
// ============================================================

import type {
  Action,
  ActionResult,
  ActionError,
  ActionErrorCode,
  ClickAction,
  TypeAction,
  PressAction,
  ScrollAction,
  NavigateAction,
  WaitAction,
  SelectAction,
  ExtractAction,
} from "../shared/types/actions.js";
import { resolveRef } from "./snapshot.js";

// ---- Helpers ----

function makeError(code: ActionErrorCode, message: string, ref?: number): ActionResult {
  return {
    success: false,
    error: { code, message, ref },
  };
}

function makeSuccess(data?: string): ActionResult {
  return { success: true, data };
}

/**
 * Resolve a ref to an HTMLElement, returning an error result if it fails.
 */
function resolveTarget(ref: number): HTMLElement | ActionResult {
  const el = resolveRef(ref);
  if (!el) {
    return makeError("stale_ref", `Element ref ${ref} is no longer in the DOM`, ref);
  }
  if (!(el instanceof HTMLElement)) {
    return makeError("not_interactable", `Element ref ${ref} is not an HTML element`, ref);
  }
  return el;
}

/**
 * Scroll an element into view and check it's not obscured.
 */
function ensureInteractable(el: HTMLElement, ref: number): ActionResult | null {
  // Scroll into view
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });

  // Check visibility
  const style = getComputedStyle(el);
  if (style.display === "none") {
    return makeError("not_interactable", "Element is hidden (display: none)", ref);
  }
  if (style.visibility === "hidden") {
    return makeError("not_interactable", "Element is hidden (visibility: hidden)", ref);
  }

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return makeError("not_interactable", "Element has zero size", ref);
  }

  // Check if element or a descendant is at the click point
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const topEl = document.elementFromPoint(centerX, centerY);
  if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
    // Element might be obscured, but we'll still try
    // (some overlays are transparent, or the element might be partially visible)
  }

  return null; // No error — element is interactable
}

// ---- Action implementations ----

/**
 * Click an element.
 */
function executeClick(action: ClickAction): ActionResult {
  const target = resolveTarget(action.ref);
  if ("success" in target) return target;
  const el = target;

  const interactableError = ensureInteractable(el, action.ref);
  if (interactableError) return interactableError;

  const button = action.button === "right" ? 2 : action.button === "middle" ? 1 : 0;
  const clickCount = action.clickCount || 1;

  // Build modifier flags
  const modifiers = action.modifiers || [];
  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    button,
    detail: clickCount,
    altKey: modifiers.includes("Alt"),
    ctrlKey: modifiers.includes("Control"),
    metaKey: modifiers.includes("Meta"),
    shiftKey: modifiers.includes("Shift"),
    view: window,
  };

  // Set coordinates to element center
  const rect = el.getBoundingClientRect();
  const coords = {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    screenX: rect.left + rect.width / 2,
    screenY: rect.top + rect.height / 2,
  };

  // Dispatch full click sequence
  for (let i = 0; i < clickCount; i++) {
    el.dispatchEvent(new PointerEvent("pointerdown", { ...eventInit, ...coords }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...eventInit, ...coords }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...eventInit, ...coords }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...eventInit, ...coords }));
    el.dispatchEvent(new MouseEvent("click", { ...eventInit, ...coords, detail: i + 1 }));
  }

  if (clickCount >= 2) {
    el.dispatchEvent(new MouseEvent("dblclick", { ...eventInit, ...coords }));
  }

  // Also use native click for good measure (handles <a> navigation, etc.)
  if (button === 0 && clickCount === 1) {
    el.click();
  }

  return makeSuccess();
}

/**
 * Type text into an element.
 */
function executeType(action: TypeAction): ActionResult {
  const target = resolveTarget(action.ref);
  if ("success" in target) return target;
  const el = target;

  const interactableError = ensureInteractable(el, action.ref);
  if (interactableError) return interactableError;

  // Check if element is editable
  const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const isContentEditable = el.getAttribute("contenteditable") === "true";

  if (!isInput && !isContentEditable) {
    return makeError("not_interactable", "Element is not editable", action.ref);
  }

  // Focus the element
  el.focus();

  // Clear if requested
  if (action.clear) {
    if (isInput) {
      (el as HTMLInputElement | HTMLTextAreaElement).value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (isContentEditable) {
      el.textContent = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Type the text
  if (isInput) {
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
    // Set value directly (most reliable approach)
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        "value"
      )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(inputEl, inputEl.value + action.text);
    } else {
      inputEl.value += action.text;
    }

    // Dispatch input events
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (isContentEditable) {
    // For contenteditable, insert text at cursor
    document.execCommand("insertText", false, action.text);
  }

  // Submit if requested (press Enter)
  if (action.submit) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));

    // Also try to submit the form if there is one
    const form = el.closest("form");
    if (form) {
      form.requestSubmit();
    }
  }

  return makeSuccess();
}

/**
 * Press a keyboard key.
 */
function executePress(action: PressAction): ActionResult {
  let targetEl: HTMLElement;

  if (action.ref !== undefined) {
    const target = resolveTarget(action.ref);
    if ("success" in target) return target;
    targetEl = target;
  } else {
    // Default to focused element or body
    targetEl = (document.activeElement as HTMLElement) || document.body;
  }

  const modifiers = action.modifiers || [];
  const eventInit: KeyboardEventInit = {
    key: action.key,
    code: keyToCode(action.key),
    bubbles: true,
    cancelable: true,
    altKey: modifiers.includes("Alt"),
    ctrlKey: modifiers.includes("Control"),
    metaKey: modifiers.includes("Meta"),
    shiftKey: modifiers.includes("Shift"),
    view: window,
  };

  targetEl.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  targetEl.dispatchEvent(new KeyboardEvent("keypress", eventInit));
  targetEl.dispatchEvent(new KeyboardEvent("keyup", eventInit));

  return makeSuccess();
}

/**
 * Map key names to code values.
 */
function keyToCode(key: string): string {
  const map: Record<string, string> = {
    Enter: "Enter",
    Escape: "Escape",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Space: "Space",
    " ": "Space",
  };
  if (map[key]) return map[key];
  if (key.length === 1) return `Key${key.toUpperCase()}`;
  return key;
}

/**
 * Scroll the viewport or a specific element.
 */
function executeScroll(action: ScrollAction): ActionResult {
  let target: HTMLElement;

  if (action.ref !== undefined) {
    const resolved = resolveTarget(action.ref);
    if ("success" in resolved) return resolved;
    target = resolved;
  } else {
    target = document.documentElement;
  }

  const amount = action.amount || (action.direction === "up" || action.direction === "down"
    ? window.innerHeight * 0.8
    : window.innerWidth * 0.8);

  let scrollLeft = 0;
  let scrollTop = 0;

  switch (action.direction) {
    case "up":
      scrollTop = -amount;
      break;
    case "down":
      scrollTop = amount;
      break;
    case "left":
      scrollLeft = -amount;
      break;
    case "right":
      scrollLeft = amount;
      break;
  }

  if (action.ref !== undefined) {
    target.scrollBy({ left: scrollLeft, top: scrollTop, behavior: "instant" });
  } else {
    window.scrollBy({ left: scrollLeft, top: scrollTop, behavior: "instant" });
  }

  return makeSuccess();
}

/**
 * Navigate to a URL or use browser history.
 */
function executeNavigate(action: NavigateAction): ActionResult {
  const url = action.url.trim();

  switch (url) {
    case "back":
      window.history.back();
      break;
    case "forward":
      window.history.forward();
      break;
    case "reload":
      window.location.reload();
      break;
    default:
      // Validate URL before navigation
      try {
        new URL(url, window.location.href);
        window.location.href = url;
      } catch {
        return makeError("invalid_action", `Invalid URL: ${url}`);
      }
      break;
  }

  return makeSuccess();
}

/**
 * Wait for a condition.
 */
async function executeWait(action: WaitAction): Promise<ActionResult> {
  const timeout = action.timeout || 5000;
  const startTime = Date.now();
  const state = action.state || "visible";

  // Wait for ref to be in desired state
  if (action.ref !== undefined) {
    return waitForCondition(timeout, startTime, () => {
      const el = resolveRef(action.ref!);
      if (!el || !(el instanceof HTMLElement)) {
        return state === "detached" || state === "hidden";
      }
      switch (state) {
        case "visible":
          return isElementVisible(el);
        case "hidden":
          return !isElementVisible(el);
        case "attached":
          return el.isConnected;
        case "detached":
          return !el.isConnected;
        default:
          return true;
      }
    });
  }

  // Wait for CSS selector
  if (action.selector) {
    return waitForCondition(timeout, startTime, () => {
      const el = document.querySelector(action.selector!);
      if (!el || !(el instanceof HTMLElement)) {
        return state === "detached" || state === "hidden";
      }
      switch (state) {
        case "visible":
          return isElementVisible(el);
        case "hidden":
          return !isElementVisible(el);
        case "attached":
          return el.isConnected;
        case "detached":
          return !el.isConnected;
        default:
          return true;
      }
    });
  }

  // Fixed timeout wait
  await sleep(Math.min(timeout, 10000));
  return makeSuccess();
}

function isElementVisible(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

async function waitForCondition(
  timeout: number,
  startTime: number,
  check: () => boolean
): Promise<ActionResult> {
  while (Date.now() - startTime < timeout) {
    if (check()) return makeSuccess();
    await sleep(100);
  }
  return makeError("timeout", `Wait timed out after ${timeout}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Select options in a <select> element.
 */
function executeSelect(action: SelectAction): ActionResult {
  const target = resolveTarget(action.ref);
  if ("success" in target) return target;
  const el = target;

  if (!(el instanceof HTMLSelectElement)) {
    return makeError("not_interactable", "Element is not a <select>", action.ref);
  }

  // Clear existing selections for multi-select
  if (el.multiple) {
    for (const option of el.options) {
      option.selected = false;
    }
  }

  // Select the requested values
  let matched = false;
  for (const option of el.options) {
    if (action.values.includes(option.value) || action.values.includes(option.text)) {
      option.selected = true;
      matched = true;
      if (!el.multiple) break;
    }
  }

  if (!matched) {
    return makeError("target_not_found", `No option matching values: ${action.values.join(", ")}`, action.ref);
  }

  // Dispatch change events
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  return makeSuccess();
}

/**
 * Extract data from an element.
 * Sensitive field values and storage content are redacted.
 */
function executeExtract(action: ExtractAction): ActionResult {
  let el: HTMLElement | null = null;

  if (action.ref !== undefined) {
    const target = resolveTarget(action.ref);
    if ("success" in target) return target;
    el = target;
  } else if (action.selector) {
    el = document.querySelector(action.selector) as HTMLElement | null;
    if (!el) {
      return makeError("target_not_found", `No element matching selector: ${action.selector}`);
    }
  } else {
    return makeError("invalid_action", "Extract requires either ref or selector");
  }

  // Block extraction of sensitive attributes
  if (action.extract === "attribute" && action.attribute) {
    const blockedAttrs = ["cookie", "authorization", "x-api-key", "x-auth-token"];
    if (blockedAttrs.includes(action.attribute.toLowerCase())) {
      return makeSuccess("[REDACTED - sensitive attribute]");
    }
  }

  // Redact value extraction from sensitive fields
  if (action.extract === "text" || action.extract === "attribute") {
    if (isSensitiveElement(el)) {
      if (action.extract === "attribute" && action.attribute === "value") {
        return makeSuccess("[REDACTED]");
      }
      // For text extraction from password-type inputs, redact
      if (el instanceof HTMLInputElement && el.type === "password") {
        return makeSuccess("[REDACTED]");
      }
    }
  }

  switch (action.extract) {
    case "text":
      return makeSuccess(el.textContent?.trim() || "");
    case "innerHTML":
      return makeSuccess(redactSensitiveHTML(el.innerHTML));
    case "outerHTML":
      return makeSuccess(redactSensitiveHTML(el.outerHTML));
    case "attribute":
      if (!action.attribute) {
        return makeError("invalid_action", "Extract 'attribute' requires an attribute name");
      }
      const value = el.getAttribute(action.attribute);
      return makeSuccess(value ?? "");
    default:
      return makeError("invalid_action", `Unknown extract type: ${action.extract}`);
  }
}

/**
 * Check if an element is sensitive (password, hidden, CC fields).
 */
function isSensitiveElement(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (type === "password" || type === "hidden") return true;
    const nameOrId = (el.name + " " + el.id).toLowerCase();
    const sensitivePatterns = [
      /password/i, /secret/i, /token/i, /api.?key/i, /cvv/i, /cvc/i,
      /ssn/i, /otp/i, /credit.?card/i, /card.?number/i, /\bpin\b/i,
    ];
    if (sensitivePatterns.some((p) => p.test(nameOrId))) return true;
    const autocomplete = el.getAttribute("autocomplete") || "";
    if (/password|cc-|one-time-code/.test(autocomplete)) return true;
  }
  return false;
}

/**
 * Redact sensitive values from extracted HTML.
 * Replaces value attributes on password and hidden inputs with [REDACTED].
 */
function redactSensitiveHTML(html: string): string {
  // Redact password input values
  return html
    .replace(
      /(<input[^>]*type\s*=\s*["']password["'][^>]*)\bvalue\s*=\s*["'][^"']*["']/gi,
      '$1value="[REDACTED]"'
    )
    .replace(
      /(<input[^>]*type\s*=\s*["']hidden["'][^>]*)\bvalue\s*=\s*["'][^"']*["']/gi,
      '$1value="[REDACTED]"'
    );
}

// ---- Main dispatch ----

/**
 * Execute an action and return the result.
 * This is the main entry point called by the content script message handler.
 */
export async function executeAction(action: Action): Promise<ActionResult> {
  try {
    switch (action.type) {
      case "click":
        return executeClick(action);
      case "type":
        return executeType(action);
      case "press":
        return executePress(action);
      case "scroll":
        return executeScroll(action);
      case "navigate":
        return executeNavigate(action);
      case "wait":
        return executeWait(action);
      case "select":
        return executeSelect(action);
      case "extract":
        return executeExtract(action);
      default:
        return makeError("invalid_action", `Unknown action type: ${(action as Action).type}`);
    }
  } catch (err) {
    return makeError(
      "execution_error",
      err instanceof Error ? err.message : String(err)
    );
  }
}
