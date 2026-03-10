// ============================================================
// Safety — action classification, risk assessment, rate limiting, audit log
//
// This module runs in the MCP server (Node.js). It classifies
// actions by side-effect level, detects high-risk patterns,
// manages approval gates, enforces rate limits, and maintains
// an audit log.
// ============================================================

import type { Action } from "./types/actions.js";
import type {
  SideEffectLevel,
  RiskAssessment,
  RiskTag,
  ElementContext,
  ApprovalRequest,
  ApprovalResult,
  AuditEntry,
  RateLimitConfig,
  RateLimitStatus,
} from "./types/safety.js";

// ============================================================
// Action Classification
// ============================================================

/**
 * Get the base side-effect level for an action type.
 * This is the intrinsic level before considering element context.
 */
export function getBaseSideEffectLevel(action: Action): SideEffectLevel {
  switch (action.type) {
    case "extract":
      return "none";
    case "wait":
      return "none";
    case "scroll":
      return "read";
    case "click":
      return "low"; // May be elevated to "high" based on target
    case "type":
      return "low"; // May be elevated if submit=true
    case "press":
      return "low";
    case "select":
      return "low";
    case "navigate":
      return "high"; // Navigation always has side effects
  }
}

// ---- High-risk text patterns ----

/** Button/link text that suggests a purchase or payment action */
const PURCHASE_PATTERNS = [
  /\bbuy\b/i,
  /\bpurchase\b/i,
  /\bcheckout\b/i,
  /\bcheck\s*out\b/i,
  /\bpay\b/i,
  /\bplace\s*order\b/i,
  /\border\s*now\b/i,
  /\badd\s*to\s*cart\b/i,
  /\bsubscribe\b/i,
  /\bupgrade\b/i,
  /\bconfirm\s*purchase\b/i,
  /\bcomplete\s*payment\b/i,
];

/** Text that suggests a destructive/delete action */
const DELETE_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdestroy\b/i,
  /\berase\b/i,
  /\bwipe\b/i,
  /\bpurge\b/i,
  /\bdrop\b/i,
  /\bcancel\s*account\b/i,
  /\bclose\s*account\b/i,
  /\bdeactivate\b/i,
  /\bunsubscribe\b/i,
  /\brevoke\b/i,
  /\bterminate\b/i,
];

/** Text that suggests sending a message or data */
const SEND_PATTERNS = [
  /\bsend\b/i,
  /\bsubmit\b/i,
  /\bpost\b/i,
  /\bpublish\b/i,
  /\bshare\b/i,
  /\bbroadcast\b/i,
  /\breply\b/i,
  /\bforward\b/i,
  /\btransfer\b/i,
];

/** Text that suggests a download action */
const DOWNLOAD_PATTERNS = [
  /\bdownload\b/i,
  /\bexport\b/i,
  /\bsave\s*as\b/i,
  /\binstall\b/i,
];

/** Text that suggests an authentication action */
const AUTH_PATTERNS = [
  /\blog\s*in\b/i,
  /\bsign\s*in\b/i,
  /\blog\s*out\b/i,
  /\bsign\s*out\b/i,
  /\bsign\s*up\b/i,
  /\bregister\b/i,
  /\breset\s*password\b/i,
  /\bchange\s*password\b/i,
  /\bauthorize\b/i,
  /\bgrant\s*access\b/i,
  /\bpermission\b/i,
];

/**
 * Match text against a list of patterns, returning true if any match.
 */
function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Get the combined text to check for risk patterns.
 * Combines element name, text, role, and relevant attributes.
 */
function getCombinedText(el: ElementContext): string {
  const parts: string[] = [];
  if (el.name) parts.push(el.name);
  if (el.text) parts.push(el.text);
  if (el.attrs?.title) parts.push(el.attrs.title);
  if (el.attrs?.["aria-label"]) parts.push(el.attrs["aria-label"]);
  if (el.attrs?.value) parts.push(el.attrs.value);
  return parts.join(" ");
}

/**
 * Detect risk tags for a click action based on target element context.
 */
function detectClickRiskTags(el: ElementContext): RiskTag[] {
  const tags: RiskTag[] = [];
  const text = getCombinedText(el);

  // Check for submit button (form submission)
  if (el.tag === "button" || el.tag === "input") {
    const type = el.type || el.attrs?.type || "";
    if (type === "submit") {
      tags.push("form_submit");
    }
  }
  if (el.role === "button" || el.tag === "button") {
    // Heuristic: buttons inside forms are likely submit actions
    // (this is a conservative approximation — exact form detection
    //  happens in the content script at execution time)
  }

  // Check text patterns
  if (matchesAny(text, PURCHASE_PATTERNS)) tags.push("purchase", "payment");
  if (matchesAny(text, DELETE_PATTERNS)) tags.push("delete", "destructive");
  if (matchesAny(text, SEND_PATTERNS)) tags.push("send");
  if (matchesAny(text, DOWNLOAD_PATTERNS)) tags.push("download");
  if (matchesAny(text, AUTH_PATTERNS)) tags.push("authentication");

  // External link detection
  if (el.tag === "a" && el.attrs?.href) {
    const href = el.attrs.href;
    if (href.startsWith("http") || href.startsWith("//")) {
      tags.push("external_link");
    }
  }

  // File upload input
  if (el.tag === "input" && (el.type === "file" || el.attrs?.type === "file")) {
    tags.push("file_upload");
  }

  return [...new Set(tags)]; // Deduplicate
}

// ============================================================
// Risk Assessment
// ============================================================

/**
 * Classify an action and assess its risk level.
 *
 * @param action The action to classify
 * @param targetElement Optional element context (from snapshot) for the action's target
 * @returns Risk assessment with side-effect level, approval requirement, and tags
 */
export function assessRisk(action: Action, targetElement?: ElementContext): RiskAssessment {
  const baseLevel = getBaseSideEffectLevel(action);
  let level: SideEffectLevel = baseLevel;
  let requiresApproval = false;
  let reason: string | undefined;
  const tags: RiskTag[] = [];

  switch (action.type) {
    case "click": {
      if (targetElement) {
        const clickTags = detectClickRiskTags(targetElement);
        tags.push(...clickTags);

        // Elevate to high if any high-risk tags detected
        if (
          clickTags.includes("purchase") ||
          clickTags.includes("delete") ||
          clickTags.includes("form_submit") ||
          clickTags.includes("payment") ||
          clickTags.includes("send")
        ) {
          level = "high";
          requiresApproval = true;
          reason = `Clicking element may trigger: ${clickTags.join(", ")}`;
        }
      }
      break;
    }

    case "type": {
      if (action.submit) {
        level = "high";
        tags.push("form_submit");
        requiresApproval = true;
        reason = "Typing with submit=true will submit the form";
      }
      break;
    }

    case "press": {
      // Enter key on a focused form element can submit
      if (action.key === "Enter") {
        tags.push("form_submit");
        // Don't auto-require approval for Enter — it's common
        // but flag it for the audit log
      }
      break;
    }

    case "navigate": {
      tags.push("navigation");
      const url = action.url.trim().toLowerCase();
      if (url !== "back" && url !== "forward" && url !== "reload") {
        // Navigating to a new URL — potentially destructive if unsaved state
        requiresApproval = false; // Navigation is expected behavior
        // But flag external navigation
        if (url.startsWith("http") || url.startsWith("//")) {
          tags.push("external_link");
        }
      }
      break;
    }

    case "select": {
      // Select is generally low-risk, but could be part of a form
      break;
    }

    // extract, wait, scroll — no additional classification needed
  }

  return {
    level,
    requiresApproval,
    reason,
    tags: [...new Set(tags)],
  };
}

/**
 * Generate a human-readable description of what an action will do.
 */
export function describeAction(action: Action, targetElement?: ElementContext): string {
  switch (action.type) {
    case "click": {
      const target = targetElement
        ? `"${targetElement.name || targetElement.text || targetElement.tag}" (${targetElement.role})`
        : `element [ref=${action.ref}]`;
      return `Click ${target}`;
    }
    case "type": {
      const preview = action.text.length > 50 ? action.text.slice(0, 50) + "..." : action.text;
      const target = targetElement
        ? `"${targetElement.name || targetElement.tag}"`
        : `element [ref=${action.ref}]`;
      return `Type "${preview}" into ${target}${action.submit ? " and submit" : ""}`;
    }
    case "press":
      return `Press ${action.key}${action.modifiers?.length ? ` with ${action.modifiers.join("+")}` : ""}`;
    case "scroll":
      return `Scroll ${action.direction}${action.ref !== undefined ? ` element [ref=${action.ref}]` : " page"}`;
    case "navigate":
      return `Navigate to ${action.url}`;
    case "wait":
      return `Wait${action.selector ? ` for ${action.selector}` : ""}${action.ref !== undefined ? ` for element [ref=${action.ref}]` : ""}${action.timeout ? ` (timeout: ${action.timeout}ms)` : ""}`;
    case "select":
      return `Select "${action.values.join(", ")}" in element [ref=${action.ref}]`;
    case "extract":
      return `Extract ${action.extract}${action.ref !== undefined ? ` from element [ref=${action.ref}]` : ""}${action.selector ? ` from ${action.selector}` : ""}`;
  }
}

// ============================================================
// Rate Limiter
// ============================================================

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxActions: 60,
  windowMs: 60_000, // 60 actions per minute
  maxHighRiskActions: 5,
  highRiskWindowMs: 60_000, // 5 high-risk actions per minute
};

/**
 * In-memory sliding window rate limiter.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private highRiskTimestamps: number[] = [];
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
  }

  /**
   * Check if an action is allowed under current rate limits.
   */
  check(isHighRisk: boolean): RateLimitStatus {
    const now = Date.now();

    // Prune expired timestamps
    this.timestamps = this.timestamps.filter(
      (t) => now - t < this.config.windowMs
    );
    this.highRiskTimestamps = this.highRiskTimestamps.filter(
      (t) => now - t < this.config.highRiskWindowMs
    );

    // Check high-risk limit first
    if (isHighRisk && this.highRiskTimestamps.length >= this.config.maxHighRiskActions) {
      const oldest = this.highRiskTimestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetsAt: oldest + this.config.highRiskWindowMs,
        reason: `High-risk action rate limit exceeded (${this.config.maxHighRiskActions} per ${this.config.highRiskWindowMs / 1000}s)`,
      };
    }

    // Check overall limit
    if (this.timestamps.length >= this.config.maxActions) {
      const oldest = this.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetsAt: oldest + this.config.windowMs,
        reason: `Action rate limit exceeded (${this.config.maxActions} per ${this.config.windowMs / 1000}s)`,
      };
    }

    return {
      allowed: true,
      remaining: this.config.maxActions - this.timestamps.length,
      resetsAt: now + this.config.windowMs,
    };
  }

  /**
   * Record that an action was executed.
   */
  record(isHighRisk: boolean): void {
    const now = Date.now();
    this.timestamps.push(now);
    if (isHighRisk) {
      this.highRiskTimestamps.push(now);
    }
  }

  /**
   * Reset the rate limiter state.
   */
  reset(): void {
    this.timestamps = [];
    this.highRiskTimestamps = [];
  }
}

// ============================================================
// Audit Log
// ============================================================

const MAX_AUDIT_ENTRIES = 1000;

/**
 * In-memory audit log for action tracking.
 * Keeps the last N entries in a circular buffer.
 */
export class AuditLog {
  private entries: AuditEntry[] = [];
  private nextEntryId = 1;

  /**
   * Create a new audit entry for an action.
   * Returns the entry ID for later updates.
   */
  record(params: {
    sessionId: string;
    tabId?: number;
    action: Action;
    risk: RiskAssessment;
    approvalRequested: boolean;
    approval?: ApprovalResult;
    pageUrl?: string;
    snapshotVersionBefore?: number;
  }): string {
    const entryId = `audit_${this.nextEntryId++}`;

    const entry: AuditEntry = {
      entryId,
      sessionId: params.sessionId,
      tabId: params.tabId,
      action: params.action,
      risk: params.risk,
      approvalRequested: params.approvalRequested,
      approval: params.approval,
      pageUrl: params.pageUrl,
      snapshotVersionBefore: params.snapshotVersionBefore,
      timestamp: Date.now(),
    };

    this.entries.push(entry);

    // Trim to max size
    if (this.entries.length > MAX_AUDIT_ENTRIES) {
      this.entries = this.entries.slice(-MAX_AUDIT_ENTRIES);
    }

    return entryId;
  }

  /**
   * Update an existing audit entry with execution results.
   */
  update(entryId: string, updates: {
    result?: import("./types/actions.js").ActionResult;
    snapshotVersionAfter?: number;
    durationMs?: number;
  }): void {
    const entry = this.entries.find((e) => e.entryId === entryId);
    if (entry) {
      if (updates.result !== undefined) entry.result = updates.result;
      if (updates.snapshotVersionAfter !== undefined) entry.snapshotVersionAfter = updates.snapshotVersionAfter;
      if (updates.durationMs !== undefined) entry.durationMs = updates.durationMs;
    }
  }

  /**
   * Get recent audit entries, optionally filtered.
   */
  getRecent(count: number = 50, filter?: {
    sessionId?: string;
    tabId?: number;
    tags?: RiskTag[];
    level?: SideEffectLevel;
  }): AuditEntry[] {
    let filtered = this.entries;

    if (filter) {
      if (filter.sessionId) {
        filtered = filtered.filter((e) => e.sessionId === filter.sessionId);
      }
      if (filter.tabId !== undefined) {
        filtered = filtered.filter((e) => e.tabId === filter.tabId);
      }
      if (filter.tags?.length) {
        filtered = filtered.filter((e) =>
          filter.tags!.some((tag) => e.risk.tags.includes(tag))
        );
      }
      if (filter.level) {
        filtered = filtered.filter((e) => e.risk.level === filter.level);
      }
    }

    return filtered.slice(-count);
  }

  /**
   * Get the total number of entries.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }
}
