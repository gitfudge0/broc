import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installFromRepoBuild,
  stageRuntimeArtifacts,
  type ActiveInstallRecord,
} from "../cli/bootstrap.js";
import type { AppPaths, RepoPaths } from "../cli/paths.js";
import { createEmptySetupState, type SetupState } from "../cli/state.js";

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

async function createRepoFixture(root: string): Promise<RepoPaths> {
  const repoRoot = resolve(root, "repo");
  const distDir = resolve(repoRoot, "dist");

  await mkdir(resolve(distDir, "chrome"), { recursive: true });
  await Promise.all([
    writeFile(resolve(repoRoot, "package.json"), JSON.stringify({
      name: "broc",
      version: "1.2.3",
      dependencies: {
        "@modelcontextprotocol/sdk": "^1.27.1",
        "@puppeteer/browsers": "^2.13.0",
      },
    }, null, 2)),
    writeFile(resolve(repoRoot, "package-lock.json"), JSON.stringify({
      name: "broc",
      lockfileVersion: 3,
      packages: {},
    }, null, 2)),
    writeFile(resolve(distDir, "bridge.mjs"), "bridge"),
    writeFile(resolve(distDir, "mcp-server.mjs"), "mcp"),
    writeFile(resolve(distDir, "cli.mjs"), "cli"),
    writeFile(resolve(distDir, "chrome", "manifest.json"), "{}"),
  ]);

  return {
    repoRoot,
    distDir,
    bridgePath: resolve(distDir, "bridge.mjs"),
    mcpServerPath: resolve(distDir, "mcp-server.mjs"),
    cliPath: resolve(distDir, "cli.mjs"),
    firefoxExtensionDir: resolve(distDir, "firefox"),
    chromeExtensionDir: resolve(distDir, "chrome"),
    webExtConfigPath: resolve(repoRoot, "web-ext.config.mjs"),
    webExtBinaryPath: resolve(repoRoot, "node_modules", ".bin", "web-ext"),
  };
}

function createProvisionedState(appPaths: AppPaths, installRoot: string): SetupState {
  const state = createEmptySetupState({
    installVersion: "1.2.3",
    installRoot,
    activeWrapperPath: appPaths.wrapperPath,
    managedProfilePath: resolve(appPaths.profilesDir, "chromium"),
    distDir: resolve(installRoot, "dist"),
    bridgePath: resolve(installRoot, "dist", "bridge.mjs"),
    mcpServerPath: resolve(installRoot, "dist", "mcp-server.mjs"),
    chromeExtensionDir: resolve(installRoot, "dist", "chrome"),
  });
  state.browsers.chromium = {
    browser: "chromium",
    profilePath: resolve(appPaths.profilesDir, "chromium"),
    runtime: "managed-chromium",
    executablePath: "/cache/chromium/chrome",
    preparedAt: new Date().toISOString(),
    nativeManifestBrowsers: ["chromium"],
    manifestMode: "profile",
  };
  return state;
}

describe("bootstrap staging", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      const { rm } = await import("fs/promises");
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("stages package metadata and runs npm ci in the temp install root", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-stage-"));
    const appPaths = createAppPaths(tempDir);
    const repoPaths = await createRepoFixture(tempDir);
    const runCommand = vi.fn(async () => {});

    const stagedPaths = await stageRuntimeArtifacts(appPaths, repoPaths, "1.2.3", { runCommand });

    expect(runCommand).toHaveBeenCalledWith(
      expect.stringMatching(/^npm/),
      ["ci", "--omit=dev", "--ignore-scripts", "--prefer-offline"],
      { cwd: resolve(appPaths.installsDir, "1.2.3.tmp") },
    );
    expect(stagedPaths.repoRoot).toBe(resolve(appPaths.installsDir, "1.2.3"));
    expect(await readFile(resolve(stagedPaths.repoRoot, "package.json"), "utf-8")).toContain("\"version\": \"1.2.3\"");
    expect(await readFile(resolve(stagedPaths.repoRoot, "package-lock.json"), "utf-8")).toContain("\"lockfileVersion\": 3");
    expect(await readFile(resolve(stagedPaths.distDir, "cli.mjs"), "utf-8")).toBe("cli");
  });

  it("does not rewrite the wrapper or active install marker when dependency install fails", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-stage-"));
    const appPaths = createAppPaths(tempDir);
    const repoPaths = await createRepoFixture(tempDir);
    const installRoot = resolve(appPaths.installsDir, "1.2.3");

    await Promise.all([
      mkdir(installRoot, { recursive: true }),
      mkdir(appPaths.binDir, { recursive: true }),
      mkdir(appPaths.dataDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(appPaths.wrapperPath, "old-wrapper"),
      writeFile(appPaths.activeInstallFile, JSON.stringify({
        installVersion: "0.9.0",
        installRoot,
        updatedAt: "2026-03-14T00:00:00.000Z",
      } satisfies ActiveInstallRecord, null, 2)),
    ]);
    await writeFile(resolve(installRoot, "keep.txt"), "old-install");

    await expect(installFromRepoBuild(appPaths, repoPaths, {
      runCommand: vi.fn(async () => {
        throw new Error("npm ci failed");
      }),
      provisionRuntime: vi.fn(async () => {
        throw new Error("should not provision");
      }),
    })).rejects.toThrow("npm ci failed");

    expect(await readFile(resolve(installRoot, "keep.txt"), "utf-8")).toBe("old-install");
    expect(await readFile(appPaths.wrapperPath, "utf-8")).toBe("old-wrapper");
    expect(JSON.parse(await readFile(appPaths.activeInstallFile, "utf-8"))).toMatchObject({
      installVersion: "0.9.0",
    });
  });

  it("finalizes wrapper and active install only after staging and provisioning succeed", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-stage-"));
    const appPaths = createAppPaths(tempDir);
    const repoPaths = await createRepoFixture(tempDir);
    const events: string[] = [];

    const result = await installFromRepoBuild(appPaths, repoPaths, {
      runCommand: vi.fn(async () => {
        events.push("install-deps");
      }),
      provisionRuntime: vi.fn(async (_appPaths, stagedPaths) => {
        events.push("provision");
        return createProvisionedState(appPaths, stagedPaths.repoRoot);
      }),
    });

    expect(events).toEqual(["install-deps", "provision"]);
    expect(result.stagedPaths.repoRoot).toBe(resolve(appPaths.installsDir, "1.2.3"));
    expect(await readFile(appPaths.wrapperPath, "utf-8")).toContain(appPaths.activeInstallFile);
    expect(JSON.parse(await readFile(appPaths.activeInstallFile, "utf-8"))).toMatchObject({
      installVersion: "1.2.3",
      installRoot: result.stagedPaths.repoRoot,
    });
  });
});
