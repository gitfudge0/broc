// ============================================================
// Safety types — action classification, risk levels, audit log
// ============================================================

import type { Action, ActionResult } from "./actions.js";

// ---- Side-effect classification ----

/**
 * Side-effect level for an action.
 *
 * - `none`  — Pure observation, no page mutation (extract, wait)
 * - `read`  — Reads state, may focus elements but no mutation (scroll)
 * - `low`   — Minor mutation unlikely to cause harm (type text, press key, click non-submit)
 * - `high`  — Potentially destructive or irreversible (submit form, navigate away, click purchase/delete)
 */
export type SideEffectLevel = "none" | "read" | "low" | "high";

/**
 * Risk classification for an action, determined by combining
 * the action's intrinsic side-effect level with context from
 * the snapshot (target element properties).
 */
export interface RiskAssessment {
  /** Base side-effect level of this action type */
  level: SideEffectLevel;
  /** Whether this specific action instance requires approval */
  requiresApproval: boolean;
  /** Human-readable reason why approval is required (if applicable) */
  reason?: string;
  /** Risk category tags for audit/logging */
  tags: RiskTag[];
}

/**
 * Risk tags that can be attached to an action for classification.
 */
export type RiskTag =
  | "form_submit"
  | "purchase"
  | "delete"
  | "send"
  | "download"
  | "navigation"
  | "authentication"
  | "payment"
  | "destructive"
  | "external_link"
  | "file_upload";

// ---- Approval gate ----

/**
 * An approval request surfaced to the agent/user when a
 * high-risk action is detected.
 */
export interface ApprovalRequest {
  /** Unique ID for this approval request */
  approvalId: string;
  /** The action that requires approval */
  action: Action;
  /** Risk assessment that triggered the approval */
  risk: RiskAssessment;
  /** Human-readable description of what the action will do */
  description: string;
  /** Target element summary (if action targets an element) */
  targetSummary?: string;
  /** Page URL where the action will be executed */
  pageUrl?: string;
  /** Timestamp of the request */
  timestamp: number;
}

/** Approval decision from the agent/user */
export type ApprovalDecision = "approve" | "deny" | "timeout";

/** Result of an approval request */
export interface ApprovalResult {
  approvalId: string;
  decision: ApprovalDecision;
  /** Who made the decision */
  decidedBy: "agent" | "user" | "system";
  timestamp: number;
}

// ---- Audit log ----

/**
 * An entry in the action audit log.
 * Records every action attempted, whether approved or not.
 */
export interface AuditEntry {
  /** Unique entry ID */
  entryId: string;
  /** Session ID */
  sessionId: string;
  /** Tab ID where the action was executed */
  tabId?: number;
  /** The action that was attempted */
  action: Action;
  /** Risk assessment for the action */
  risk: RiskAssessment;
  /** Whether approval was requested */
  approvalRequested: boolean;
  /** Approval result (if approval was requested) */
  approval?: ApprovalResult;
  /** Result of executing the action (if it was executed) */
  result?: ActionResult;
  /** Snapshot version before the action */
  snapshotVersionBefore?: number;
  /** Snapshot version after the action (if page changed) */
  snapshotVersionAfter?: number;
  /** When the action was initiated */
  timestamp: number;
  /** How long the action took to execute (ms) */
  durationMs?: number;
  /** Page URL at time of action */
  pageUrl?: string;
}

// ---- Rate limiting ----

/**
 * Rate limiter configuration.
 */
export interface RateLimitConfig {
  /** Maximum actions per window */
  maxActions: number;
  /** Time window in ms */
  windowMs: number;
  /** Maximum high-risk actions per window */
  maxHighRiskActions: number;
  /** High-risk time window in ms */
  highRiskWindowMs: number;
}

/**
 * Rate limit status returned when checking limits.
 */
export interface RateLimitStatus {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Number of actions remaining in the current window */
  remaining: number;
  /** When the current window resets (ms since epoch) */
  resetsAt: number;
  /** Reason for denial, if not allowed */
  reason?: string;
}

// ---- Element context for risk assessment ----

/**
 * Minimal element context needed for risk assessment.
 * Extracted from the snapshot's ElementRef to avoid coupling
 * the safety module to the full snapshot types.
 */
export interface ElementContext {
  tag: string;
  role: string;
  name: string;
  text?: string;
  attrs?: Record<string, string>;
  /** Type attribute for inputs */
  type?: string;
}
