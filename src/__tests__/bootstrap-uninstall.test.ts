import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { removeDirIfEmpty, resetInstalledRuntimeWithDeps } from "../cli/bootstrap.js";
import { createEmptySetupState, saveSetupState, type SetupState } from "../cli/state.js";
import type { AppPaths } from "../cli/paths.js";

function createAppPaths(root: string): AppPaths {
  const configDir = resolve(root, "config");
  const cacheDir = resolve(root, "cache");
  const dataDir = resolve(root, "data");
  return {
    configDir,
    cacheDir,
    dataDir,
    profilesDir: resolve(configDir, "profiles"),
    runtimesDir: resolve(cacheDir, "runtimes"),
    installsDir: resolve(dataDir, "installs"),
    binDir: resolve(dataDir, "bin"),
    wrapperPath: resolve(dataDir, "bin", "broc"),
    activeInstallFile: resolve(dataDir, "active-install.json"),
    stateFile: resolve(configDir, "setup-state.json"),
  };
}

function createState(appPaths: AppPaths): SetupState {
  const state = createEmptySetupState({
    installVersion: "0.1.0",
    installRoot: resolve(appPaths.installsDir, "0.1.0"),
    activeWrapperPath: appPaths.wrapperPath,
    managedProfilePath: resolve(appPaths.profilesDir, "chromium"),
    distDir: resolve(appPaths.installsDir, "0.1.0", "dist"),
    bridgePath: resolve(appPaths.installsDir, "0.1.0", "dist", "bridge.mjs"),
    mcpServerPath: resolve(appPaths.installsDir, "0.1.0", "dist", "mcp-server.mjs"),
    chromeExtensionDir: resolve(appPaths.installsDir, "0.1.0", "dist", "chrome"),
  });
  state.managedChromium = {
    browser: "chromium",
    buildId: "123",
    executablePath: "/tmp/chromium",
    cacheDir: resolve(appPaths.runtimesDir, "chromium"),
    installedAt: new Date().toISOString(),
  };
  state.integration = {
    publicExecutablePath: resolve(appPaths.dataDir, "public-bin", "broc"),
    pathBlockFiles: [resolve(appPaths.configDir, ".zshrc")],
  };
  return state;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    try {
      const { access } = await import("fs/promises");
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}

describe("bootstrap uninstall", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      const { rm } = await import("fs/promises");
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("removes staged runtime targets and calls runtime/native cleanup", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-bootstrap-"));
    const appPaths = createAppPaths(tempDir);
    const state = createState(appPaths);

    await Promise.all([
      mkdir(appPaths.configDir, { recursive: true }),
      mkdir(appPaths.cacheDir, { recursive: true }),
      mkdir(appPaths.dataDir, { recursive: true }),
      mkdir(resolve(appPaths.profilesDir, "chromium"), { recursive: true }),
      mkdir(appPaths.runtimesDir, { recursive: true }),
      mkdir(resolve(appPaths.installsDir, "0.1.0"), { recursive: true }),
      mkdir(appPaths.binDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(appPaths.wrapperPath, "wrapper"),
      writeFile(appPaths.activeInstallFile, "{}"),
      saveSetupState(appPaths.stateFile, state),
    ]);

    const removeRuntime = vi.fn(async () => {});
    const removeNativeManifests = vi.fn(async () => {});
    const removePublicExecutable = vi.fn(async () => {});
    const removePathBlocks = vi.fn(async () => {});

    await resetInstalledRuntimeWithDeps(appPaths, {
      removeRuntime,
      removeNativeManifests,
      removePublicExecutable,
      removePathBlocks,
      isProfileLocked: () => false,
    }, state);

    expect(removeRuntime).toHaveBeenCalledWith(state.managedChromium);
    expect(removeNativeManifests).toHaveBeenCalledOnce();
    expect(removePublicExecutable).toHaveBeenCalledWith(state.integration?.publicExecutablePath);
    expect(removePathBlocks).toHaveBeenCalledWith(state.integration?.pathBlockFiles);
    expect(await exists(appPaths.wrapperPath)).toBe(false);
    expect(await exists(appPaths.activeInstallFile)).toBe(false);
    expect(await exists(appPaths.installsDir)).toBe(false);
    expect(await exists(appPaths.profilesDir)).toBe(false);
    expect(await exists(appPaths.runtimesDir)).toBe(false);
    expect(await exists(appPaths.stateFile)).toBe(false);
  });

  it("is idempotent when runtime artifacts are already absent", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-bootstrap-"));
    const appPaths = createAppPaths(tempDir);

    await resetInstalledRuntimeWithDeps(appPaths, {
      removeRuntime: vi.fn(async () => {}),
      removeNativeManifests: vi.fn(async () => {}),
      isProfileLocked: () => false,
    }, null);

    await resetInstalledRuntimeWithDeps(appPaths, {
      removeRuntime: vi.fn(async () => {}),
      removeNativeManifests: vi.fn(async () => {}),
      isProfileLocked: () => false,
    }, null);
  });

  it("fails early when the managed profile is locked", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-bootstrap-"));
    const appPaths = createAppPaths(tempDir);
    const state = createState(appPaths);

    await expect(resetInstalledRuntimeWithDeps(appPaths, {
      isProfileLocked: () => true,
    }, state)).rejects.toThrow("managed Chromium profile appears to be in use");
  });

  it("removes only empty directories", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-bootstrap-"));
    const emptyDir = resolve(tempDir, "empty");
    const nonEmptyDir = resolve(tempDir, "non-empty");

    await mkdir(emptyDir, { recursive: true });
    await mkdir(nonEmptyDir, { recursive: true });
    await writeFile(resolve(nonEmptyDir, "keep.txt"), "keep");

    await removeDirIfEmpty(emptyDir);
    await removeDirIfEmpty(nonEmptyDir);

    expect(await exists(emptyDir)).toBe(false);
    expect(await exists(nonEmptyDir)).toBe(true);
  });
});
