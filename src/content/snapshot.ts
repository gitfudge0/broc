// ============================================================
// Snapshot engine — DOM walker, element extraction, page snapshot
// ============================================================

import type {
  ElementRef,
  ElementState,
  BoundingBox,
  PageSnapshot,
  FrameInfo,
} from "../shared/index.js";
import { getRole, getAccessibleName, getVisibleTextContent } from "./aria.js";
import { generateLocators } from "./locators.js";

// ---- Configuration ----

const MAX_ELEMENTS = 5000;
const MAX_TEXT_LENGTH = 200;

/**
 * Sensitive input types whose values should be redacted.
 */
const SENSITIVE_INPUT_TYPES = new Set([
  "password",
  "hidden",
]);

/**
 * Sensitive input name/id patterns (case-insensitive).
 */
const SENSITIVE_NAME_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api.?key/i,
  /auth/i,
  /credit.?card/i,
  /card.?number/i,
  /card.?num/i,
  /cvv/i,
  /cvc/i,
  /csc/i,
  /ssn/i,
  /social.?security/i,
  /otp/i,
  /one.?time/i,
  /verification.?code/i,
  /security.?code/i,
  /pin.?code/i,
  /\bpin\b/i,
  /routing.?number/i,
  /account.?number/i,
  /bank.?account/i,
  /sort.?code/i,
  /iban/i,
  /swift/i,
];

/**
 * Autocomplete attribute values that indicate sensitive data.
 * See: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofilling-form-controls
 */
const SENSITIVE_AUTOCOMPLETE_VALUES = new Set([
  "cc-number",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  "cc-type",
  "new-password",
  "current-password",
  "one-time-code",
]);

// ---- Ref management ----

/** Maps integer refs back to live DOM elements for the current snapshot */
let refToElement = new WeakRef<Map<number, Element>>(new Map());
let nextRef = 1;

/**
 * Get the current ref-to-element map, creating a new one if needed.
 */
function getRefMap(): Map<number, Element> {
  const map = refToElement.deref();
  if (map) return map;
  const newMap = new Map<number, Element>();
  refToElement = new WeakRef(newMap);
  return newMap;
}

/**
 * Reset refs for a new snapshot.
 */
function resetRefs(): Map<number, Element> {
  const map = new Map<number, Element>();
  refToElement = new WeakRef(map);
  nextRef = 1;
  return map;
}

/**
 * Assign a ref to an element and store the mapping.
 */
function assignRef(el: Element, map: Map<number, Element>): number {
  const ref = nextRef++;
  map.set(ref, el);
  return ref;
}

/**
 * Resolve a ref back to its live DOM element.
 * Returns null if the ref is stale (element removed from DOM).
 */
export function resolveRef(ref: number): Element | null {
  const map = getRefMap();
  const el = map.get(ref);
  if (!el) return null;
  // Check if still in DOM
  if (!el.isConnected) return null;
  return el;
}

// ---- Visibility checks ----

/**
 * Check if an element is visible in the viewport.
 * An element is considered visible if it has a non-zero bounding box
 * and is not hidden via CSS or HTML attributes.
 */
function isVisible(el: HTMLElement): boolean {
  // Skip elements hidden by HTML attribute
  if (el.hidden) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;

  // Check computed style
  const style = getComputedStyle(el);
  if (style.display === "none") return false;
  if (style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (parseFloat(style.opacity) === 0) return false;

  // Check bounding box (zero-size elements are hidden)
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}

// ---- Element interest filter ----

/**
 * Tags that are always interesting to include in the snapshot,
 * regardless of interactivity.
 */
const ALWAYS_INTERESTING_TAGS = new Set([
  "a", "button", "input", "textarea", "select", "option",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "video", "audio", "canvas",
  "table", "th", "td",
  "form", "fieldset", "legend", "label",
  "nav", "main", "header", "footer", "aside",
  "dialog", "details", "summary",
  "iframe",
]);

/**
 * ARIA roles that make an element interesting even if the tag isn't.
 */
const INTERESTING_ROLES = new Set([
  "button", "link", "checkbox", "radio", "textbox", "combobox",
  "listbox", "option", "menuitem", "menu", "menubar",
  "tab", "tabpanel", "tablist",
  "dialog", "alertdialog", "alert",
  "navigation", "banner", "contentinfo", "main", "complementary",
  "search", "form", "region",
  "tree", "treeitem", "grid", "row", "cell",
  "slider", "spinbutton", "switch", "progressbar",
  "heading", "img", "figure",
  "status", "log", "timer",
  "toolbar", "tooltip",
]);

/**
 * Determine if an element is "interesting" enough to include in the snapshot.
 * We want to capture elements that an agent might want to interact with or
 * that provide important semantic structure.
 */
function isInteresting(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();

  // Always include certain tags
  if (ALWAYS_INTERESTING_TAGS.has(tag)) return true;

  // Include elements with interesting ARIA roles
  const role = getRole(el);
  if (INTERESTING_ROLES.has(role)) return true;

  // Include elements with explicit interaction attributes
  if (el.hasAttribute("onclick") || el.hasAttribute("tabindex")) return true;
  if (el.getAttribute("contenteditable") === "true") return true;
  if (el.hasAttribute("data-testid")) return true;

  // Include elements with cursor: pointer (likely clickable)
  const style = getComputedStyle(el);
  if (style.cursor === "pointer") return true;

  // Include elements with meaningful text if they're leaf-ish nodes
  // (i.e., they contain text but not many child elements)
  if (el.children.length <= 1) {
    const text = el.textContent?.trim();
    if (text && text.length > 0 && text.length < 500) {
      // But skip if parent is already interesting (avoid duplication)
      const parent = el.parentElement;
      if (parent && isInteresting(parent)) return false;
      // Include paragraphs, spans with text, divs with direct text
      if (tag === "p" || tag === "span" || tag === "li") return true;
    }
  }

  return false;
}

// ---- Element extraction ----

/**
 * Check if an input is a sensitive field whose value should be redacted.
 */
function isSensitiveField(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    // Check input type
    if (SENSITIVE_INPUT_TYPES.has(el.type.toLowerCase())) return true;

    // Check name and id against patterns
    const nameOrId = (el.name + " " + el.id).toLowerCase();
    if (SENSITIVE_NAME_PATTERNS.some((p) => p.test(nameOrId))) return true;

    // Check autocomplete attribute
    const autocomplete = el.getAttribute("autocomplete")?.toLowerCase() || "";
    if (autocomplete) {
      // Autocomplete can have multiple tokens (e.g., "shipping cc-number")
      const tokens = autocomplete.split(/\s+/);
      if (tokens.some((t) => SENSITIVE_AUTOCOMPLETE_VALUES.has(t))) return true;
      // Legacy check for partial matches
      if (autocomplete.includes("password")) return true;
      if (autocomplete.includes("cc-")) return true;
    }

    // Check aria-label for sensitive hints
    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
    if (SENSITIVE_NAME_PATTERNS.some((p) => p.test(ariaLabel))) return true;

    // Check placeholder for sensitive hints
    const placeholder = (el.placeholder || "").toLowerCase();
    if (SENSITIVE_NAME_PATTERNS.some((p) => p.test(placeholder))) return true;
  }

  // Also check textarea for sensitive patterns
  if (el instanceof HTMLTextAreaElement) {
    const nameOrId = (el.name + " " + el.id).toLowerCase();
    if (SENSITIVE_NAME_PATTERNS.some((p) => p.test(nameOrId))) return true;
  }

  return false;
}

/**
 * Get the current value of a form element, redacting sensitive fields.
 */
function getElementValue(el: HTMLElement): string | undefined {
  if (isSensitiveField(el)) return "[REDACTED]";

  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (type === "checkbox" || type === "radio") return undefined; // Handled by state
    if (type === "file") return el.files?.length ? `${el.files.length} file(s)` : undefined;
    return el.value || undefined;
  }
  if (el instanceof HTMLTextAreaElement) return el.value || undefined;
  if (el instanceof HTMLSelectElement) {
    const selected = Array.from(el.selectedOptions).map((o) => o.text);
    return selected.length > 0 ? selected.join(", ") : undefined;
  }
  if (el.getAttribute("contenteditable") === "true") {
    return getVisibleTextContent(el, MAX_TEXT_LENGTH) || undefined;
  }
  return undefined;
}

/**
 * Get interactability and state flags for an element.
 */
function getElementState(el: HTMLElement): ElementState {
  const tag = el.tagName.toLowerCase();
  const isFormControl =
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLButtonElement;

  const style = getComputedStyle(el);
  const disabled =
    isFormControl && (el as HTMLInputElement).disabled;

  return {
    visible: isVisible(el),
    enabled: !disabled,
    clickable: isClickable(el),
    editable: isEditable(el),
    focusable: isFocusable(el),
    checked: el instanceof HTMLInputElement ? el.checked || undefined : undefined,
    selected: el instanceof HTMLOptionElement ? el.selected || undefined : undefined,
    readonly:
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
        ? el.readOnly || undefined
        : undefined,
    required:
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
        ? el.required || undefined
        : undefined,
    expanded: el.getAttribute("aria-expanded") !== null
      ? el.getAttribute("aria-expanded") === "true"
      : undefined,
  };
}

function isClickable(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (["a", "button", "summary"].includes(tag)) return true;
  if (el instanceof HTMLInputElement && ["button", "submit", "reset", "image", "checkbox", "radio"].includes(el.type))
    return true;
  if (el.hasAttribute("onclick") || el.getAttribute("role") === "button") return true;
  if (getComputedStyle(el).cursor === "pointer") return true;
  return false;
}

function isEditable(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    const editableTypes = ["text", "email", "password", "search", "tel", "url", "number", "date", "time", "datetime-local", "month", "week"];
    return editableTypes.includes(type) && !el.readOnly && !el.disabled;
  }
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el.getAttribute("contenteditable") === "true") return true;
  return false;
}

function isFocusable(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (["a", "button", "input", "textarea", "select", "summary"].includes(tag)) return true;
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null && parseInt(tabindex, 10) >= 0) return true;
  if (el.getAttribute("contenteditable") === "true") return true;
  return false;
}

/**
 * Get the bounding box of an element relative to the viewport.
 */
function getBounds(el: HTMLElement): BoundingBox {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/**
 * Get useful HTML attributes for identification.
 */
function getAttrs(el: HTMLElement): Record<string, string> | undefined {
  const attrs: Record<string, string> = {};

  if (el.id) attrs.id = el.id;
  if (el.className && typeof el.className === "string") {
    const classes = el.className.trim();
    if (classes) attrs.class = classes;
  }
  if (el instanceof HTMLInputElement && el.type) attrs.type = el.type;
  if (el.getAttribute("name")) attrs.name = el.getAttribute("name")!;
  if (el instanceof HTMLAnchorElement && el.href) attrs.href = el.href;
  if (el.getAttribute("data-testid")) attrs["data-testid"] = el.getAttribute("data-testid")!;

  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

// ---- DOM Walker ----

interface WalkResult {
  elements: ElementRef[];
  truncated: boolean;
  totalElements: number;
}

/**
 * Walk the DOM tree, extracting interesting visible elements.
 * Returns a flat list with depth information for tree reconstruction.
 */
export function walkDOM(root: HTMLElement = document.body, framePath: string[] = []): WalkResult {
  const refMap = resetRefs();
  const elements: ElementRef[] = [];
  let totalElements = 0;
  let truncated = false;

  function walk(node: HTMLElement, depth: number) {
    if (truncated) return;

    totalElements++;

    const tag = node.tagName.toLowerCase();

    // Skip script, style, noscript, template
    if (["script", "style", "noscript", "template", "svg"].includes(tag)) return;

    // Check visibility
    if (!isVisible(node)) return;

    // Determine if this element is interesting
    if (isInteresting(node)) {
      if (elements.length >= MAX_ELEMENTS) {
        truncated = true;
        return;
      }

      const ref = assignRef(node, refMap);
      const role = getRole(node);
      const name = getAccessibleName(node);
      const text = getVisibleTextContent(node, MAX_TEXT_LENGTH);

      const elementRef: ElementRef = {
        ref,
        tag,
        role,
        name,
        text: text || undefined,
        value: getElementValue(node),
        state: getElementState(node),
        bounds: getBounds(node),
        framePath: framePath.length > 0 ? framePath : undefined,
        locators: generateLocators(node),
        attrs: getAttrs(node),
        depth,
      };

      elements.push(elementRef);
    }

    // Recurse into children
    for (const child of node.children) {
      if (child instanceof HTMLElement) {
        walk(child, depth + 1);
      }
    }

    // Handle same-origin iframes
    if (tag === "iframe") {
      try {
        const iframe = node as HTMLIFrameElement;
        const iframeDoc = iframe.contentDocument;
        if (iframeDoc?.body) {
          const iframeId = iframe.id || iframe.name || `iframe-${elements.length}`;
          walk(iframeDoc.body as HTMLElement, depth + 1);
        }
      } catch {
        // Cross-origin iframe — skip content (reported as opaque frame)
      }
    }

    // Pierce open shadow roots
    if (node.shadowRoot) {
      for (const child of node.shadowRoot.children) {
        if (child instanceof HTMLElement) {
          walk(child, depth + 1);
        }
      }
    }
  }

  walk(root, 0);

  return { elements, truncated, totalElements };
}

// ---- Snapshot version ----

let snapshotVersion = 0;

export function incrementSnapshotVersion(): number {
  return ++snapshotVersion;
}

export function getSnapshotVersion(): number {
  return snapshotVersion;
}

// ---- Main snapshot function ----

/**
 * Capture a full page snapshot.
 * This is the primary function called in response to an `observe` request.
 */
export function captureSnapshot(): PageSnapshot {
  const version = incrementSnapshotVersion();
  const { elements, truncated, totalElements } = walkDOM();

  // Build frame info
  const frames: FrameInfo[] = [
    {
      id: "main",
      url: window.location.href,
      isMain: true,
      sameOrigin: true,
    },
  ];

  // Detect iframes
  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((iframe, i) => {
    let sameOrigin = false;
    let url = iframe.src || "about:blank";
    try {
      // If we can access contentDocument, it's same-origin
      if (iframe.contentDocument) {
        sameOrigin = true;
        url = iframe.contentDocument.location.href;
      }
    } catch {
      sameOrigin = false;
    }

    frames.push({
      id: iframe.id || iframe.name || `iframe-${i}`,
      url,
      isMain: false,
      sameOrigin,
      parentId: "main",
    });
  });

  // Find focused element ref
  let focusedRef: number | undefined;
  const activeEl = document.activeElement;
  if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
    // Look up the ref for the active element
    const refMap = getRefMap();
    for (const [ref, el] of refMap) {
      if (el === activeEl) {
        focusedRef = ref;
        break;
      }
    }
  }

  return {
    version,
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scroll: {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    },
    loadingState:
      document.readyState === "complete"
        ? "complete"
        : document.readyState === "interactive"
          ? "interactive"
          : "loading",
    focusedRef,
    frames,
    elements,
    truncated,
    totalElements,
    timestamp: Date.now(),
  };
}
