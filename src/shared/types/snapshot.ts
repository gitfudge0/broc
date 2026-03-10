// ============================================================
// PageSnapshot — full structured representation of page state
// ============================================================

import type { ElementRef } from "./elements.js";

/** Loading state of the page */
export type LoadingState = "loading" | "interactive" | "complete";

/** Information about a frame (main frame or iframe) */
export interface FrameInfo {
  /** Frame identifier */
  id: string;
  /** URL of the frame */
  url: string;
  /** Whether this is the main/top frame */
  isMain: boolean;
  /** Whether the frame is same-origin (content accessible) */
  sameOrigin: boolean;
  /** Parent frame id, absent for the main frame */
  parentId?: string;
}

/** Viewport dimensions */
export interface Viewport {
  width: number;
  height: number;
}

/** Scroll position */
export interface ScrollPosition {
  scrollX: number;
  scrollY: number;
  scrollWidth: number;
  scrollHeight: number;
}

/**
 * Complete structured snapshot of the current page state.
 * Returned in response to an `observe` request.
 */
export interface PageSnapshot {
  /** Monotonically increasing snapshot version (bumped on navigation/significant DOM change) */
  version: number;
  /** Page URL */
  url: string;
  /** Page title */
  title: string;
  /** Viewport dimensions */
  viewport: Viewport;
  /** Document scroll position */
  scroll: ScrollPosition;
  /** Page loading state */
  loadingState: LoadingState;
  /** Ref of the currently focused element, if any */
  focusedRef?: number;
  /** Frame tree for the page */
  frames: FrameInfo[];
  /** Flat list of element refs (tree structure encoded via depth + children) */
  elements: ElementRef[];
  /** Whether the element list was truncated due to size limits */
  truncated: boolean;
  /** Total element count before truncation */
  totalElements: number;
  /** Timestamp of snapshot capture (ms since epoch) */
  timestamp: number;
}
