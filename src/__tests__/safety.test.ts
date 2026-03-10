// ============================================================
// Tests for the safety module — action classification, risk
// assessment, rate limiting, and audit log
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  getBaseSideEffectLevel,
  assessRisk,
  describeAction,
  RateLimiter,
  AuditLog,
} from "../shared/safety.js";
import type { Action } from "../shared/types/actions.js";
import type { ElementContext } from "../shared/types/safety.js";

// ============================================================
// getBaseSideEffectLevel
// ============================================================

describe("getBaseSideEffectLevel", () => {
  it("classifies extract as none", () => {
    const action: Action = { type: "extract", extract: "text", ref: 1 };
    expect(getBaseSideEffectLevel(action)).toBe("none");
  });

  it("classifies wait as none", () => {
    const action: Action = { type: "wait", timeout: 1000 };
    expect(getBaseSideEffectLevel(action)).toBe("none");
  });

  it("classifies scroll as read", () => {
    const action: Action = { type: "scroll", direction: "down" };
    expect(getBaseSideEffectLevel(action)).toBe("read");
  });

  it("classifies click as low", () => {
    const action: Action = { type: "click", ref: 1 };
    expect(getBaseSideEffectLevel(action)).toBe("low");
  });

  it("classifies type as low", () => {
    const action: Action = { type: "type", ref: 1, text: "hello" };
    expect(getBaseSideEffectLevel(action)).toBe("low");
  });

  it("classifies press as low", () => {
    const action: Action = { type: "press", key: "Enter" };
    expect(getBaseSideEffectLevel(action)).toBe("low");
  });

  it("classifies select as low", () => {
    const action: Action = { type: "select", ref: 1, values: ["opt1"] };
    expect(getBaseSideEffectLevel(action)).toBe("low");
  });

  it("classifies navigate as high", () => {
    const action: Action = { type: "navigate", url: "https://example.com" };
    expect(getBaseSideEffectLevel(action)).toBe("high");
  });
});

// ============================================================
// assessRisk — click actions
// ============================================================

describe("assessRisk — click actions", () => {
  it("returns low risk for a plain click without element context", () => {
    const action: Action = { type: "click", ref: 1 };
    const risk = assessRisk(action);
    expect(risk.level).toBe("low");
    expect(risk.requiresApproval).toBe(false);
    expect(risk.tags).toEqual([]);
  });

  it("returns low risk for clicking a safe button", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "button",
      role: "button",
      name: "Close",
    };
    const risk = assessRisk(action, el);
    expect(risk.level).toBe("low");
    expect(risk.requiresApproval).toBe(false);
  });

  it("detects purchase button as high risk", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "button",
      role: "button",
      name: "Buy Now",
    };
    const risk = assessRisk(action, el);
    expect(risk.level).toBe("high");
    expect(risk.requiresApproval).toBe(true);
    expect(risk.tags).toContain("purchase");
    expect(risk.tags).toContain("payment");
  });

  it("detects checkout button as high risk", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "button",
      role: "button",
      name: "Proceed to Checkout",
    };
    const risk = assessRisk(action, el);
    expect(risk.level).toBe("high");
    expect(risk.requiresApproval).toBe(true);
    expect(risk.tags).toContain("purchase");
  });

  it("detects delete button as high risk", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "button",
      role: "button",
      name: "Delete Account",
    };
    const risk = assessRisk(action, el);
    expect(risk.level).toBe("high");
    expect(risk.requiresApproval).toBe(true);
    expect(risk.tags).toContain("delete");
    expect(risk.tags).toContain("destructive");
  });

  it("detects submit button as high risk via type=submit", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "input",
      role: "button",
      name: "Submit",
      type: "submit",
    };
    const risk = assessRisk(action, el);
    expect(risk.level).toBe("high");
    expect(risk.requiresApproval).toBe(true);
    expect(risk.tags).toContain("form_submit");
  });

  it("detects send action as high risk", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "button",
      role: "button",
      name: "Send Message",
    };
    const risk = assessRisk(action, el);
    expect(risk.level).toBe("high");
    expect(risk.requiresApproval).toBe(true);
    expect(risk.tags).toContain("send");
  });

  it("detects download links", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "a",
      role: "link",
      name: "Download PDF",
    };
    const risk = assessRisk(action, el);
    expect(risk.tags).toContain("download");
  });

  it("detects authentication actions", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "button",
      role: "button",
      name: "Sign Out",
    };
    const risk = assessRisk(action, el);
    expect(risk.tags).toContain("authentication");
  });

  it("detects external links", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "a",
      role: "link",
      name: "Visit website",
      attrs: { href: "https://external.example.com" },
    };
    const risk = assessRisk(action, el);
    expect(risk.tags).toContain("external_link");
  });

  it("detects file upload inputs", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "input",
      role: "button",
      name: "Choose File",
      type: "file",
    };
    const risk = assessRisk(action, el);
    expect(risk.tags).toContain("file_upload");
  });

  it("deduplicates risk tags", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "button",
      role: "button",
      name: "Buy Now — Purchase Item",
      // Both "buy" and "purchase" match PURCHASE_PATTERNS
    };
    const risk = assessRisk(action, el);
    // Should not have duplicate "purchase" tags
    const purchaseCount = risk.tags.filter((t) => t === "purchase").length;
    expect(purchaseCount).toBeLessThanOrEqual(1);
  });

  it("uses combined text from name, text, and attrs for detection", () => {
    const action: Action = { type: "click", ref: 1 };
    const el: ElementContext = {
      tag: "button",
      role: "button",
      name: "Continue",
      text: "Continue to purchase",
    };
    const risk = assessRisk(action, el);
    expect(risk.tags).toContain("purchase");
  });
});

// ============================================================
// assessRisk — type actions
// ============================================================

describe("assessRisk — type actions", () => {
  it("classifies normal typing as low risk", () => {
    const action: Action = { type: "type", ref: 1, text: "hello" };
    const risk = assessRisk(action);
    expect(risk.level).toBe("low");
    expect(risk.requiresApproval).toBe(false);
  });

  it("classifies typing with submit as high risk", () => {
    const action: Action = { type: "type", ref: 1, text: "query", submit: true };
    const risk = assessRisk(action);
    expect(risk.level).toBe("high");
    expect(risk.requiresApproval).toBe(true);
    expect(risk.tags).toContain("form_submit");
  });
});

// ============================================================
// assessRisk — press actions
// ============================================================

describe("assessRisk — press actions", () => {
  it("flags Enter key as form_submit", () => {
    const action: Action = { type: "press", key: "Enter" };
    const risk = assessRisk(action);
    expect(risk.tags).toContain("form_submit");
    // Enter doesn't auto-require approval (it's common)
    expect(risk.requiresApproval).toBe(false);
  });

  it("does not flag Escape key", () => {
    const action: Action = { type: "press", key: "Escape" };
    const risk = assessRisk(action);
    expect(risk.tags).toEqual([]);
  });
});

// ============================================================
// assessRisk — navigate actions
// ============================================================

describe("assessRisk — navigate actions", () => {
  it("classifies all navigation as high", () => {
    const action: Action = { type: "navigate", url: "https://example.com" };
    const risk = assessRisk(action);
    expect(risk.level).toBe("high");
    expect(risk.tags).toContain("navigation");
  });

  it("does not require approval for navigation (expected behavior)", () => {
    const action: Action = { type: "navigate", url: "https://example.com" };
    const risk = assessRisk(action);
    expect(risk.requiresApproval).toBe(false);
  });

  it("tags external URLs", () => {
    const action: Action = { type: "navigate", url: "https://example.com" };
    const risk = assessRisk(action);
    expect(risk.tags).toContain("external_link");
  });

  it("does not tag back/forward/reload as external", () => {
    expect(assessRisk({ type: "navigate", url: "back" }).tags).not.toContain("external_link");
    expect(assessRisk({ type: "navigate", url: "forward" }).tags).not.toContain("external_link");
    expect(assessRisk({ type: "navigate", url: "reload" }).tags).not.toContain("external_link");
  });
});

// ============================================================
// describeAction
// ============================================================

describe("describeAction", () => {
  it("describes click action", () => {
    const action: Action = { type: "click", ref: 5 };
    expect(describeAction(action)).toBe("Click element [ref=5]");
  });

  it("describes click with element context", () => {
    const action: Action = { type: "click", ref: 5 };
    const el: ElementContext = { tag: "button", role: "button", name: "Save" };
    expect(describeAction(action, el)).toBe('Click "Save" (button)');
  });

  it("describes type action", () => {
    const action: Action = { type: "type", ref: 3, text: "hello world" };
    expect(describeAction(action)).toBe('Type "hello world" into element [ref=3]');
  });

  it("describes type with submit", () => {
    const action: Action = { type: "type", ref: 3, text: "query", submit: true };
    expect(describeAction(action)).toBe('Type "query" into element [ref=3] and submit');
  });

  it("truncates long type text", () => {
    const longText = "a".repeat(60);
    const action: Action = { type: "type", ref: 1, text: longText };
    const desc = describeAction(action);
    expect(desc).toContain("...");
    expect(desc.length).toBeLessThan(100);
  });

  it("describes press action", () => {
    const action: Action = { type: "press", key: "Enter" };
    expect(describeAction(action)).toBe("Press Enter");
  });

  it("describes press with modifiers", () => {
    const action: Action = { type: "press", key: "a", modifiers: ["Control"] };
    expect(describeAction(action)).toBe("Press a with Control");
  });

  it("describes scroll action", () => {
    const action: Action = { type: "scroll", direction: "down" };
    expect(describeAction(action)).toBe("Scroll down page");
  });

  it("describes scroll element", () => {
    const action: Action = { type: "scroll", direction: "up", ref: 7 };
    expect(describeAction(action)).toBe("Scroll up element [ref=7]");
  });

  it("describes navigate action", () => {
    const action: Action = { type: "navigate", url: "https://example.com" };
    expect(describeAction(action)).toBe("Navigate to https://example.com");
  });

  it("describes wait action", () => {
    const action: Action = { type: "wait", selector: ".loaded" };
    expect(describeAction(action)).toBe("Wait for .loaded");
  });

  it("describes select action", () => {
    const action: Action = { type: "select", ref: 2, values: ["opt1", "opt2"] };
    expect(describeAction(action)).toBe('Select "opt1, opt2" in element [ref=2]');
  });

  it("describes extract action", () => {
    const action: Action = { type: "extract", extract: "text", ref: 4 };
    expect(describeAction(action)).toBe("Extract text from element [ref=4]");
  });
});

// ============================================================
// RateLimiter
// ============================================================

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      maxActions: 5,
      windowMs: 1000,
      maxHighRiskActions: 2,
      highRiskWindowMs: 1000,
    });
  });

  it("allows actions within limit", () => {
    const status = limiter.check(false);
    expect(status.allowed).toBe(true);
    expect(status.remaining).toBe(5);
  });

  it("blocks after exceeding max actions", () => {
    for (let i = 0; i < 5; i++) {
      limiter.record(false);
    }
    const status = limiter.check(false);
    expect(status.allowed).toBe(false);
    expect(status.remaining).toBe(0);
    expect(status.reason).toContain("rate limit exceeded");
  });

  it("blocks high-risk actions after exceeding high-risk limit", () => {
    limiter.record(true);
    limiter.record(true);
    const status = limiter.check(true);
    expect(status.allowed).toBe(false);
    expect(status.reason).toContain("High-risk");
  });

  it("allows normal actions when only high-risk limit is hit", () => {
    limiter.record(true);
    limiter.record(true);
    const status = limiter.check(false);
    expect(status.allowed).toBe(true);
  });

  it("resets properly", () => {
    for (let i = 0; i < 5; i++) {
      limiter.record(false);
    }
    expect(limiter.check(false).allowed).toBe(false);
    limiter.reset();
    expect(limiter.check(false).allowed).toBe(true);
  });

  it("returns resetsAt timestamp", () => {
    for (let i = 0; i < 5; i++) {
      limiter.record(false);
    }
    const status = limiter.check(false);
    expect(status.resetsAt).toBeGreaterThan(Date.now() - 1000);
  });
});

// ============================================================
// AuditLog
// ============================================================

describe("AuditLog", () => {
  let log: AuditLog;

  const makeEntry = (overrides: Partial<{
    sessionId: string;
    tabId: number;
    actionType: string;
    riskLevel: string;
    tags: string[];
  }> = {}) => ({
    sessionId: overrides.sessionId || "session1",
    tabId: overrides.tabId,
    action: { type: (overrides.actionType || "click") as "click", ref: 1 } as Action,
    risk: {
      level: (overrides.riskLevel || "low") as "low",
      requiresApproval: false,
      tags: (overrides.tags || []) as any[],
    },
    approvalRequested: false,
    pageUrl: "https://example.com",
  });

  beforeEach(() => {
    log = new AuditLog();
  });

  it("records entries and increments size", () => {
    log.record(makeEntry());
    log.record(makeEntry());
    expect(log.size).toBe(2);
  });

  it("returns entry ID", () => {
    const id = log.record(makeEntry());
    expect(id).toMatch(/^audit_\d+$/);
  });

  it("retrieves recent entries", () => {
    log.record(makeEntry({ sessionId: "s1" }));
    log.record(makeEntry({ sessionId: "s2" }));
    log.record(makeEntry({ sessionId: "s3" }));

    const recent = log.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].sessionId).toBe("s2");
    expect(recent[1].sessionId).toBe("s3");
  });

  it("filters by sessionId", () => {
    log.record(makeEntry({ sessionId: "a" }));
    log.record(makeEntry({ sessionId: "b" }));
    log.record(makeEntry({ sessionId: "a" }));

    const filtered = log.getRecent(10, { sessionId: "a" });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.sessionId === "a")).toBe(true);
  });

  it("filters by tabId", () => {
    log.record(makeEntry({ tabId: 1 }));
    log.record(makeEntry({ tabId: 2 }));
    log.record(makeEntry({ tabId: 1 }));

    const filtered = log.getRecent(10, { tabId: 1 });
    expect(filtered).toHaveLength(2);
  });

  it("updates entries with results", () => {
    const id = log.record(makeEntry());
    log.update(id, {
      result: { success: true },
      durationMs: 150,
      snapshotVersionAfter: 2,
    });

    const entries = log.getRecent(1);
    expect(entries[0].result?.success).toBe(true);
    expect(entries[0].durationMs).toBe(150);
    expect(entries[0].snapshotVersionAfter).toBe(2);
  });

  it("trims to max size", () => {
    // AuditLog trims at 1000 entries — record 1005
    for (let i = 0; i < 1005; i++) {
      log.record(makeEntry());
    }
    expect(log.size).toBeLessThanOrEqual(1000);
  });

  it("clears all entries", () => {
    log.record(makeEntry());
    log.record(makeEntry());
    log.clear();
    expect(log.size).toBe(0);
  });

  it("records timestamp on each entry", () => {
    const before = Date.now();
    log.record(makeEntry());
    const after = Date.now();

    const entries = log.getRecent(1);
    expect(entries[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(entries[0].timestamp).toBeLessThanOrEqual(after);
  });
});
