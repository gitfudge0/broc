import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachTerminationHandlers,
  terminateProcess,
  waitForBridgeOrBrowserExit,
  waitForBridgeReady,
  type ProcessLike,
} from "../cli/launch.js";
import { orchestrateLaunchSession } from "../cli/session.js";

class FakeProcess extends EventEmitter implements ProcessLike {
  pid?: number;
  exitCode?: number | null = null;
  signalCode?: NodeJS.Signals | null = null;
  kill = vi.fn((signal?: NodeJS.Signals) => {
    if (signal === "SIGTERM" || signal === "SIGKILL") {
      queueMicrotask(() => {
        this.exitCode = signal === "SIGTERM" ? 0 : 137;
        this.signalCode = signal ?? null;
        this.emit("exit", this.exitCode, this.signalCode);
      });
    }
    return true;
  });
  unref = vi.fn();

  constructor(pid = 1234) {
    super();
    this.pid = pid;
  }
}

class HungProcess extends FakeProcess {
  override kill = vi.fn(() => true);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForBridgeReady", () => {
  it("resolves when the bridge becomes healthy", async () => {
    let attempts = 0;
    await waitForBridgeReady({
      timeoutMs: 100,
      intervalMs: 1,
      isBridgeRunning: () => true,
      pingBridge: async () => {
        attempts += 1;
        return attempts >= 2;
      },
      sleep: async () => {},
    });

    expect(attempts).toBe(2);
  });

  it("fails when the bridge never becomes healthy", async () => {
    await expect(waitForBridgeReady({
      timeoutMs: 5,
      intervalMs: 1,
      isBridgeRunning: () => false,
      pingBridge: async () => false,
      sleep: async () => {},
    })).rejects.toThrow("extension bridge did not connect");
  });
});

describe("waitForBridgeOrBrowserExit", () => {
  it("rejects when the browser exits before the bridge connects", async () => {
    const browser = new FakeProcess();
    const promise = waitForBridgeOrBrowserExit(browser, async () => {
      await new Promise<void>(() => {});
    });

    browser.emit("exit", 1, null);
    await expect(promise).rejects.toThrow("Browser exited before the extension bridge connected");
  });
});

describe("attachTerminationHandlers", () => {
  it("forwards signals to all child processes", () => {
    const browser = new FakeProcess();
    const mcp = new FakeProcess();
    const handlers = new Map<NodeJS.Signals, () => void>();

    const cleanup = attachTerminationHandlers([browser, mcp], (signal, handler) => {
      handlers.set(signal, handler);
    });

    handlers.get("SIGINT")?.();
    expect(browser.kill).toHaveBeenCalledWith("SIGINT");
    expect(mcp.kill).toHaveBeenCalledWith("SIGINT");

    cleanup();
  });
});

describe("terminateProcess", () => {
  it("force-kills a child when graceful shutdown times out", async () => {
    vi.useFakeTimers();
    const child = new HungProcess();

    const termination = terminateProcess(child, {
      timeoutMs: 5000,
      forceTimeoutMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");

    await vi.advanceTimersByTimeAsync(1000);
    await termination;
  });
});

describe("orchestrateLaunchSession", () => {
  it("starts the browser before starting MCP", async () => {
    const calls: string[] = [];
    const browser = new FakeProcess();
    const mcp = new FakeProcess();

    const promise = orchestrateLaunchSession(
      { startMcp: true },
      {
        spawnBrowser: () => {
          calls.push("browser");
          return browser;
        },
        spawnMcpServer: () => {
          calls.push("mcp");
          setTimeout(() => {
            mcp.emit("exit", 0, null);
          }, 0);
          return mcp;
        },
        waitForChildSpawn: async () => {},
        waitForBridge: async () => {
          calls.push("bridge");
        },
        openLaunchUrl: async () => {
          calls.push("open");
        },
        attachSignalHandlers: () => () => {},
      },
    );

    await promise;
    expect(calls).toEqual(["browser", "bridge", "open", "mcp"]);
  });

  it("opens the launch URL before skipping MCP for --no-mcp", async () => {
    const browser = new FakeProcess();
    const spawnMcpServer = vi.fn(() => new FakeProcess());
    const openLaunchUrl = vi.fn(async () => {});

    await orchestrateLaunchSession(
      { startMcp: false },
      {
        spawnBrowser: () => browser,
        spawnMcpServer,
        waitForChildSpawn: async () => {},
        waitForBridge: async () => {},
        openLaunchUrl,
        attachSignalHandlers: () => () => {},
      },
    );

    expect(spawnMcpServer).not.toHaveBeenCalled();
    expect(openLaunchUrl).toHaveBeenCalledOnce();
    expect(browser.unref).toHaveBeenCalledOnce();
  });

  it("settles after forwarding SIGTERM to browser and MCP children", async () => {
    const browser = new FakeProcess();
    const mcp = new FakeProcess();
    let onSignal: ((signal: NodeJS.Signals) => void | Promise<void>) | null = null;
    const terminateChildren = vi.fn(async (targets: Array<ProcessLike | null | undefined>, options?: { signal?: NodeJS.Signals }) => {
      for (const target of targets) {
        if (target) {
          target.kill(options?.signal);
        }
      }
    });

    const promise = orchestrateLaunchSession(
      { startMcp: true },
      {
        spawnBrowser: () => browser,
        spawnMcpServer: () => mcp,
        waitForChildSpawn: async () => {},
        waitForBridge: async () => {},
        openLaunchUrl: async () => {},
        terminateProcesses: terminateChildren,
        attachSignalHandlers: (_targets, handler) => {
          onSignal = handler;
          return () => {};
        },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (!onSignal) {
      throw new Error("Expected launch session to register signal handlers.");
    }

    const signalHandler = onSignal as (signal: NodeJS.Signals) => void | Promise<void>;
    await signalHandler("SIGTERM");
    await promise;

    expect(terminateChildren).toHaveBeenCalledWith([mcp, browser], { signal: "SIGTERM" });
    expect(mcp.kill).toHaveBeenCalledWith("SIGTERM");
    expect(browser.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
