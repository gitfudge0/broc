// ============================================================
// ElementRef — structured representation of a single DOM element
// ============================================================

/** Playwright-style locator candidates, ordered by priority */
export interface LocatorCandidates {
  /** role + accessible name, e.g. `getByRole('button', { name: 'Submit' })` */
  role?: { role: string; name?: string };
  /** Associated <label> text */
  label?: string;
  /** placeholder attribute */
  placeholder?: string;
  /** Visible text content (truncated) */
  text?: string;
  /** alt attribute (images) */
  alt?: string;
  /** title attribute */
  title?: string;
  /** data-testid attribute */
  testId?: string;
  /** CSS selector fallback (shortest unique path) */
  css?: string;
}

/** Bounding box relative to the viewport */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Interactability and state flags for an element */
export interface ElementState {
  visible: boolean;
  enabled: boolean;
  clickable: boolean;
  editable: boolean;
  focusable: boolean;
  checked?: boolean;
  selected?: boolean;
  readonly?: boolean;
  required?: boolean;
  expanded?: boolean;
}

/**
 * Structured reference to a single DOM element in a snapshot.
 * The `ref` is a deterministic integer stable within a single snapshot —
 * used by action commands to target elements.
 */
export interface ElementRef {
  /** Deterministic integer ref, unique within one snapshot */
  ref: number;
  /** HTML tag name (lowercase) */
  tag: string;
  /** ARIA role (explicit or implicit from tag) */
  role: string;
  /** Computed accessible name */
  name: string;
  /** Truncated visible text content (max ~200 chars) */
  text?: string;
  /** Current value (input, textarea, select — redacted for sensitive fields) */
  value?: string;
  /** Element state and interactability flags */
  state: ElementState;
  /** Viewport-relative bounding box */
  bounds: BoundingBox;
  /** Frame path for elements inside iframes, e.g. ["main", "iframe-0"] */
  framePath?: string[];
  /** Playwright-style locator candidates */
  locators: LocatorCandidates;
  /** HTML attributes useful for identification (id, class, name, type, href) */
  attrs?: Record<string, string>;
  /** Nesting depth in the DOM tree (for indentation in text representation) */
  depth: number;
  /** Children refs (for tree structure, optional) */
  children?: number[];
}
