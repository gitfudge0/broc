import { lstat, mkdtemp, mkdir, readlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { installPublicExecutable, resolvePublicBinDir } from "../cli/public-bin.js";

describe("public bin", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (!tempDir) return;
    const { rm } = await import("fs/promises");
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it("prefers ~/.local/bin by default", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-public-bin-"));
    expect(resolvePublicBinDir({ HOME: tempDir, PATH: "/usr/bin" })).toBe(resolve(tempDir, ".local", "bin"));
  });

  it("uses ~/bin when it already exists on PATH and ~/.local/bin is not", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-public-bin-"));
    const homeBin = resolve(tempDir, "bin");
    await mkdir(homeBin, { recursive: true });
    expect(resolvePublicBinDir({ HOME: tempDir, PATH: `${homeBin}:/usr/bin` })).toBe(homeBin);
  });

  it("creates a symlink to the managed wrapper", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-public-bin-"));
    const managedWrapper = resolve(tempDir, "managed", "broc");
    await mkdir(resolve(tempDir, "managed"), { recursive: true });
    await writeFile(managedWrapper, "#!/usr/bin/env node\n");

    const result = await installPublicExecutable(managedWrapper, {
      HOME: tempDir,
      PATH: "/usr/bin",
    });

    const stats = await lstat(result.executablePath);
    expect(stats.isSymbolicLink()).toBe(true);
    expect(await readlink(result.executablePath)).toBe(managedWrapper);
  });

  it("fails if a non-Broc executable already exists", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-public-bin-"));
    const publicDir = resolve(tempDir, ".local", "bin");
    const executablePath = resolve(publicDir, "broc");
    await mkdir(publicDir, { recursive: true });
    await writeFile(executablePath, "echo not-broc\n");

    await expect(installPublicExecutable(resolve(tempDir, "managed", "broc"), {
      HOME: tempDir,
      PATH: "/usr/bin",
    })).rejects.toThrow("Refusing to overwrite");
  });
});
