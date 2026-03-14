import { describe, expect, it, vi } from "vitest";
import { routeCliCommand } from "../cli/router.js";

function handlers() {
  return {
    setup: vi.fn(async () => {}),
    launch: vi.fn(async () => {}),
    serve: vi.fn(async () => {}),
    teardown: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
    uninstall: vi.fn(async () => {}),
    uninstallNativeHost: vi.fn(async () => {}),
    status: vi.fn(async () => {}),
    mcpConfig: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
    stageInstall: vi.fn(async () => {}),
    snapshot: vi.fn(async () => {}),
    help: vi.fn(async () => {}),
    unknown: vi.fn(async () => {}),
  };
}

describe("routeCliCommand", () => {
  it("routes setup", async () => {
    const mocked = handlers();
    await routeCliCommand("setup", mocked);
    expect(mocked.setup).toHaveBeenCalledOnce();
  });

  it("routes launch", async () => {
    const mocked = handlers();
    await routeCliCommand("launch", mocked);
    expect(mocked.launch).toHaveBeenCalledOnce();
  });

  it("routes empty command to serve", async () => {
    const mocked = handlers();
    await routeCliCommand("", mocked);
    expect(mocked.serve).toHaveBeenCalledOnce();
  });

  it("routes serve", async () => {
    const mocked = handlers();
    await routeCliCommand("serve", mocked);
    expect(mocked.serve).toHaveBeenCalledOnce();
  });

  it("routes uninstall", async () => {
    const mocked = handlers();
    await routeCliCommand("uninstall", mocked);
    expect(mocked.uninstall).toHaveBeenCalledOnce();
  });

  it("routes reset", async () => {
    const mocked = handlers();
    await routeCliCommand("reset", mocked);
    expect(mocked.reset).toHaveBeenCalledOnce();
  });

  it("routes uninstall-native-host", async () => {
    const mocked = handlers();
    await routeCliCommand("uninstall-native-host", mocked);
    expect(mocked.uninstallNativeHost).toHaveBeenCalledOnce();
  });

  it("routes unknown commands", async () => {
    const mocked = handlers();
    await routeCliCommand("wat", mocked);
    expect(mocked.unknown).toHaveBeenCalledWith("wat");
  });
});
