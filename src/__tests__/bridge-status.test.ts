import { describe, expect, it } from "vitest";
import {
  applyBridgePresentation,
  collectBridgeStatus,
  formatBrowserStatusText,
  type BrowserStatusReport,
} from "../shared/bridge-status.js";

describe("collectBridgeStatus", () => {
  it("reports connected when the socket is reachable and ping succeeds", async () => {
    const report = await collectBridgeStatus({
      socketPath: "/tmp/browser-control.sock",
      pidPath: "/tmp/browser-control.pid",
      socketExists: () => true,
      readPidFile: () => "123",
      isPidAlive: () => true,
      pingBridge: async () => true,
    });

    expect(report.phase).toBe("connected");
    expect(report.pingAlive).toBe(true);
    expect(report.summary).toContain("Browser automation is available");
  });

  it("reports pid_missing when no bridge process or socket exists", async () => {
    const report = await collectBridgeStatus({
      socketPath: "/tmp/browser-control.sock",
      pidPath: "/tmp/browser-control.pid",
      socketExists: () => false,
      readPidFile: () => {
        throw new Error("missing");
      },
    });

    expect(report.phase).toBe("pid_missing");
    expect(report.remediation[0]).toContain("browser-control launch");
  });

  it("reports pid_stale when a dead PID file remains", async () => {
    const report = await collectBridgeStatus({
      socketPath: "/tmp/browser-control.sock",
      pidPath: "/tmp/browser-control.pid",
      socketExists: () => false,
      readPidFile: () => "456",
      isPidAlive: () => false,
    });

    expect(report.phase).toBe("pid_stale");
  });

  it("reports socket_unreachable when the socket exists but connect checks fail", async () => {
    const report = await collectBridgeStatus({
      socketPath: "/tmp/browser-control.sock",
      pidPath: "/tmp/browser-control.pid",
      socketExists: () => true,
      readPidFile: () => "123",
      isPidAlive: () => true,
      pingBridge: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    expect(report.phase).toBe("socket_unreachable");
    expect(report.lastError).toContain("ECONNREFUSED");
  });

  it("reports ping_failed when the bridge accepts a connection but is unhealthy", async () => {
    const report = await collectBridgeStatus({
      socketPath: "/tmp/browser-control.sock",
      pidPath: "/tmp/browser-control.pid",
      socketExists: () => true,
      readPidFile: () => "123",
      isPidAlive: () => true,
      pingBridge: async () => false,
    });

    expect(report.phase).toBe("ping_failed");
    expect(report.pingAlive).toBe(false);
  });
});

describe("bridge status formatting", () => {
  it("formats remediation for disconnected bridge state", () => {
    const report = applyBridgePresentation({
      phase: "disconnected",
      socketPath: "/tmp/browser-control.sock",
      pidPath: "/tmp/browser-control.pid",
      pid: 321,
      pidAlive: false,
      socketExists: false,
      pingAlive: false,
      lastError: "Bridge disconnected.",
    });

    expect(report.summary).toContain("became unavailable");
    expect(report.remediation[0]).toContain("Relaunch");
  });

  it("renders canonical browser status text", () => {
    const report: BrowserStatusReport = {
      buildReady: true,
      setupStatePresent: true,
      bridge: applyBridgePresentation({
        phase: "ping_failed",
        socketPath: "/tmp/browser-control.sock",
        pidPath: "/tmp/browser-control.pid",
        pid: 123,
        pidAlive: true,
        socketExists: true,
        pingAlive: false,
        lastError: "Bridge health check failed.",
      }),
    };

    const text = formatBrowserStatusText(report);
    expect(text).toContain("Bridge phase: ping_failed");
    expect(text).toContain("Next step:");
  });
});
