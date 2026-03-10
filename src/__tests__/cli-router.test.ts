import { describe, expect, it, vi } from "vitest";
import { routeCliCommand } from "../cli/router.js";

function handlers() {
  return {
    setup: vi.fn(async () => {}),
    launch: vi.fn(async () => {}),
    teardown: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
    uninstall: vi.fn(async () => {}),
    status: vi.fn(async () => {}),
    snapshot: vi.fn(async () => {}),
    help: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
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

  it("routes empty command to start", async () => {
    const mocked = handlers();
    await routeCliCommand("", mocked);
    expect(mocked.start).toHaveBeenCalledOnce();
  });

  it("routes unknown commands", async () => {
    const mocked = handlers();
    await routeCliCommand("wat", mocked);
    expect(mocked.unknown).toHaveBeenCalledWith("wat");
  });
});
