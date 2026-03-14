import { describe, expect, it, vi } from "vitest";

describe("runUninstall", () => {
  it("builds the runtime when dist/cli.mjs is missing", async () => {
    const { runUninstall } = await import("../../scripts/uninstall.mjs");
    const runCommand = vi.fn(async () => {});

    await runUninstall({
      exists: (path: string) => path.endsWith("package.json"),
      runCommand,
      log: () => {},
    });

    expect(runCommand).toHaveBeenNthCalledWith(1, "npm", ["run", "build:runtime"]);
    expect(runCommand).toHaveBeenNthCalledWith(2, "node", [expect.stringContaining("dist/cli.mjs"), "reset"]);
  });

  it("skips the build when dist/cli.mjs already exists", async () => {
    const { runUninstall } = await import("../../scripts/uninstall.mjs");
    const runCommand = vi.fn(async () => {});

    await runUninstall({
      exists: (path: string) => path.endsWith("dist/cli.mjs"),
      runCommand,
      log: () => {},
    });

    expect(runCommand).toHaveBeenCalledOnce();
    expect(runCommand).toHaveBeenCalledWith("node", [expect.stringContaining("dist/cli.mjs"), "reset"]);
  });

  it("prints the uninstall summary", async () => {
    const { runUninstall } = await import("../../scripts/uninstall.mjs");
    const log = vi.fn();

    await runUninstall({
      exists: () => true,
      runCommand: vi.fn(async () => {}),
      log,
    });

    expect(log).toHaveBeenCalledWith("Broc uninstall complete.");
    expect(log).toHaveBeenCalledWith("  repo checkout left intact");
  });
});
