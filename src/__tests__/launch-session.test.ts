import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import { attachTerminationHandlers, waitForBridgeOrBrowserExit, waitForBridgeReady, type ProcessLike } from "../cli/launch.js";
import { orchestrateLaunchSession } from "../cli/session.js";

class FakeProcess extends EventEmitter implements ProcessLike {
  pid?: number;
  kill = vi.fn(() => true);
  unref = vi.fn();

  constructor(pid = 1234) {
    super();
    this.pid = pid;
  }
}

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
        stopProcess: vi.fn(),
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
        stopProcess: vi.fn(),
        attachSignalHandlers: () => () => {},
      },
    );

    expect(spawnMcpServer).not.toHaveBeenCalled();
    expect(openLaunchUrl).toHaveBeenCalledOnce();
    expect(browser.unref).toHaveBeenCalledOnce();
  });
});
