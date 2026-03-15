import { describe, expect, it, vi } from "vitest";
import { parseCleanArgs, runClean } from "../../scripts/clean.mjs";

describe("parseCleanArgs", () => {
  it("defaults to repo-only cleanup", () => {
    expect(parseCleanArgs([])).toEqual({ all: false });
  });

  it("enables full cleanup with --all", () => {
    expect(parseCleanArgs(["--all"])).toEqual({ all: true });
  });
});

describe("runClean", () => {
  it("removes dist only by default", async () => {
    const runNode = vi.fn();
    const removeDir = vi.fn(async () => {});

    await runClean([], {
      exists: () => false,
      runNode,
      removeDir,
    });

    expect(runNode).not.toHaveBeenCalled();
    expect(removeDir).toHaveBeenCalledOnce();
  });

  it("runs teardown and uninstall-native-host best-effort for --all", async () => {
    const runNode = vi.fn<(args: string[]) => Promise<void>>(async () => {});
    const removeDir = vi.fn(async () => {});

    await runClean(["--all"], {
      exists: () => true,
      runNode,
      removeDir,
    });

    expect(runNode).toHaveBeenCalledTimes(2);
    const teardownArgs = runNode.mock.calls[0]?.[0] as string[] | undefined;
    const uninstallArgs = runNode.mock.calls[1]?.[0] as string[] | undefined;
    expect(teardownArgs?.at(-1)).toBe("teardown");
    expect(uninstallArgs?.at(-1)).toBe("uninstall-native-host");
    expect(removeDir).toHaveBeenCalledOnce();
  });

  it("continues full cleanup even if teardown and uninstall fail", async () => {
    const runNode = vi.fn<(args: string[]) => Promise<void>>(async () => {
      throw new Error("expected");
    });
    const removeDir = vi.fn(async () => {});

    await runClean(["--all"], {
      exists: () => true,
      runNode,
      removeDir,
    });

    expect(removeDir).toHaveBeenCalledOnce();
  });

  it("skips CLI cleanup when dist/cli.mjs is missing", async () => {
    const runNode = vi.fn<(args: string[]) => Promise<void>>(async () => {});
    const removeDir = vi.fn(async () => {});

    await runClean(["--all"], {
      exists: () => false,
      runNode,
      removeDir,
    });

    expect(runNode).not.toHaveBeenCalled();
    expect(removeDir).toHaveBeenCalledOnce();
  });
});
