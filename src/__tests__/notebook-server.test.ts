import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { closeNotebookServer, getStandaloneNotebookUrl, startNotebookServer } from "../notebook/server.js";
import type { AppPaths, RepoPaths } from "../cli/paths.js";

const tempDirs: string[] = [];

function createAppPaths(root: string): AppPaths {
  return {
    configDir: resolve(root, "config"),
    cacheDir: resolve(root, "cache"),
    dataDir: resolve(root, "data"),
    profilesDir: resolve(root, "profiles"),
    runtimesDir: resolve(root, "runtimes"),
    installsDir: resolve(root, "installs"),
    binDir: resolve(root, "bin"),
    wrapperPath: resolve(root, "bin", "broc"),
    activeInstallFile: resolve(root, "active-install.json"),
    stateFile: resolve(root, "setup-state.json"),
  };
}

function createRepoPaths(root: string): RepoPaths {
  const distDir = resolve(root, "dist");
  return {
    repoRoot: root,
    distDir,
    bridgePath: resolve(distDir, "bridge.mjs"),
    mcpServerPath: resolve(distDir, "mcp-server.mjs"),
    cliPath: resolve(distDir, "cli.mjs"),
    firefoxExtensionDir: resolve(distDir, "firefox"),
    chromeExtensionDir: resolve(distDir, "chrome"),
    webExtConfigPath: resolve(root, "web-ext.config.mjs"),
    webExtBinaryPath: resolve(root, "node_modules", ".bin", "web-ext"),
  };
}

async function makePaths(): Promise<{ appPaths: AppPaths; repoPaths: RepoPaths }> {
  const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-server-"));
  tempDirs.push(root);
  return {
    appPaths: createAppPaths(root),
    repoPaths: createRepoPaths(root),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("notebook server helpers", () => {
  it("reuses the same standalone server for the same state key", async () => {
    const { appPaths, repoPaths } = await makePaths();

    const first = await startNotebookServer({
      appPaths,
      repoPaths,
      host: "127.0.0.1",
      port: 0,
      stateKey: "test-standalone",
    });
    const second = await startNotebookServer({
      appPaths,
      repoPaths,
      host: "127.0.0.1",
      port: 0,
      stateKey: "test-standalone",
    });

    expect(second.port).toBe(first.port);
    expect(second.server).toBe(first.server);

    await closeNotebookServer({
      appPaths,
      repoPaths,
      host: "127.0.0.1",
      port: 0,
      stateKey: "test-standalone",
    });
  });

  it("builds standalone notebook urls", () => {
    expect(getStandaloneNotebookUrl({ port: 43123 })).toBe("http://127.0.0.1:43123/notebook.html");
    expect(getStandaloneNotebookUrl({ port: 43123, taskId: "task 1" })).toBe("http://127.0.0.1:43123/notebook.html?task=task%201");
  });
});
