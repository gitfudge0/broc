import { describe, expect, it } from "vitest";
import { TaskBindingRegistry } from "../notebook/task-bindings.js";

describe("TaskBindingRegistry", () => {
  it("resolves only explicitly bound task contexts", () => {
    const registry = new TaskBindingRegistry();
    registry.bind("task-alpha", { sessionId: "session-1", tabId: 11 });

    expect(registry.resolve({ sessionId: "session-1" })).toBe("task-alpha");
    expect(registry.resolve({ tabId: 11 })).toBe("task-alpha");
    expect(registry.resolve({ sessionId: "session-2" })).toBeNull();
  });

  it("reassigns a session binding to the newest explicitly bound task", () => {
    const registry = new TaskBindingRegistry();
    registry.bind("task-alpha", { sessionId: "session-1" });
    registry.bind("task-beta", { sessionId: "session-1" });

    expect(registry.resolve({ sessionId: "session-1" })).toBe("task-beta");
  });

  it("ignores ambiguous stored bindings during seeding", () => {
    const registry = new TaskBindingRegistry();
    registry.seed([
      { taskId: "task-alpha", sessionId: "shared-session", tabId: 1 },
      { taskId: "task-beta", sessionId: "shared-session", tabId: 2 },
    ]);

    expect(registry.resolve({ sessionId: "shared-session" })).toBeNull();
    expect(registry.resolve({ tabId: 1 })).toBe("task-alpha");
    expect(registry.resolve({ tabId: 2 })).toBe("task-beta");
  });
});
