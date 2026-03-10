// ============================================================
// Actions — typed action primitives the agent can execute
// ============================================================

/** Click an element */
export interface ClickAction {
  type: "click";
  ref: number;
  /** Click variant */
  button?: "left" | "right" | "middle";
  /** Number of clicks (1 = single, 2 = double) */
  clickCount?: number;
  /** Modifier keys held during click */
  modifiers?: Array<"Alt" | "Control" | "Meta" | "Shift">;
}

/** Type text into an element */
export interface TypeAction {
  type: "type";
  ref: number;
  /** Text to type */
  text: string;
  /** Clear the field before typing */
  clear?: boolean;
  /** Press Enter after typing (form submit) */
  submit?: boolean;
  /** Delay between keystrokes in ms (0 = instant) */
  delay?: number;
}

/** Press a keyboard key */
export interface PressAction {
  type: "press";
  /** Named key: Enter, Escape, Tab, ArrowDown, etc. */
  key: string;
  /** Modifier keys held during keypress */
  modifiers?: Array<"Alt" | "Control" | "Meta" | "Shift">;
  /** Target element ref (optional — defaults to focused element) */
  ref?: number;
}

/** Scroll the viewport or a specific element */
export interface ScrollAction {
  type: "scroll";
  /** Direction to scroll */
  direction: "up" | "down" | "left" | "right";
  /** Amount in pixels (default: one viewport height/width) */
  amount?: number;
  /** Target element ref to scroll (omit for viewport scroll) */
  ref?: number;
}

/** Navigate to a URL or use browser history */
export interface NavigateAction {
  type: "navigate";
  /** URL to navigate to, or "back", "forward", "reload" */
  url: string;
}

/** Wait for a condition */
export interface WaitAction {
  type: "wait";
  /** Wait for an element matching this ref to be visible */
  ref?: number;
  /** Wait for an element matching this CSS selector to appear */
  selector?: string;
  /** Maximum wait time in ms (default: 5000) */
  timeout?: number;
  /** Wait for a specific state */
  state?: "visible" | "hidden" | "attached" | "detached";
}

/** Select an option in a <select> element */
export interface SelectAction {
  type: "select";
  ref: number;
  /** Values to select (supports multi-select) */
  values: string[];
}

/** Extract data from an element */
export interface ExtractAction {
  type: "extract";
  /** Target element ref */
  ref?: number;
  /** CSS selector (alternative to ref) */
  selector?: string;
  /** What to extract */
  extract: "text" | "innerHTML" | "outerHTML" | "attribute";
  /** Attribute name (required when extract is "attribute") */
  attribute?: string;
}

/** Union of all action types */
export type Action =
  | ClickAction
  | TypeAction
  | PressAction
  | ScrollAction
  | NavigateAction
  | WaitAction
  | SelectAction
  | ExtractAction;

/** Result of executing an action */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Extracted data (for extract actions) */
  data?: string;
  /** Error info if the action failed */
  error?: ActionError;
}

/** Structured action error */
export interface ActionError {
  code: ActionErrorCode;
  message: string;
  /** The ref that was targeted, if applicable */
  ref?: number;
}

/** Error codes for action failures */
export type ActionErrorCode =
  | "target_not_found"
  | "not_interactable"
  | "navigation_started"
  | "permission_denied"
  | "timeout"
  | "stale_ref"
  | "invalid_action"
  | "execution_error";
