import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ensurePathSetup, getPathSetupTargets, isDirOnPath, upsertManagedPathBlock } from "../cli/path-setup.js";

describe("path setup", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (!tempDir) return;
    const { rm } = await import("fs/promises");
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it("detects directories already on PATH", () => {
    expect(isDirOnPath("/tmp/bin", { PATH: "/usr/bin:/tmp/bin" })).toBe(true);
  });

  it("updates zsh config idempotently", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-path-"));
    const zshrc = resolve(tempDir, ".zshrc");
    await writeFile(zshrc, "export PATH=/usr/bin:$PATH\n");

    const once = upsertManagedPathBlock(await readFile(zshrc, "utf-8"), "/bin/zsh", `${tempDir}/.local/bin`);
    const twice = upsertManagedPathBlock(once, "/bin/zsh", `${tempDir}/.local/bin`);

    expect(once).toBe(twice);
    expect(once).toContain("# >>> broc >>>");
  });

  it("prefers bashrc only when bash_profile already sources it", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-path-"));
    await writeFile(resolve(tempDir, ".bash_profile"), "source ~/.bashrc\n");
    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    try {
      expect(getPathSetupTargets("/bin/bash")).toEqual([resolve(tempDir, ".bashrc")]);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("writes fish config blocks under conf.d", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-path-"));
    const result = await ensurePathSetup(resolve(tempDir, ".local", "bin"), {
      HOME: tempDir,
      SHELL: "/usr/bin/fish",
      PATH: "/usr/bin",
    });

    expect(result.updatedFiles).toEqual([resolve(tempDir, ".config", "fish", "conf.d", "broc.fish")]);
    expect(await readFile(result.updatedFiles[0]!, "utf-8")).toContain("fish_add_path");
  });
});
