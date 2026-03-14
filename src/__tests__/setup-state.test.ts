import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptySetupState,
  isSetupState,
  loadSetupState,
  saveSetupState,
} from "../cli/state.js";

const loadOptions = {
  activeWrapperPath: "/home/tester/.local/share/broc/bin/broc",
  defaultManagedProfilePath: "/profiles/chromium",
};

describe("setup state", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      const { rm } = await import("fs/promises");
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("creates a valid default state", () => {
    const state = createEmptySetupState({
      installVersion: "0.1.0",
      installRoot: "/repo",
      activeWrapperPath: "/home/tester/.local/share/broc/bin/broc",
      managedProfilePath: "/profiles/chromium",
      distDir: "/repo/dist",
      bridgePath: "/repo/dist/bridge.mjs",
      mcpServerPath: "/repo/dist/mcp-server.mjs",
      chromeExtensionDir: "/repo/dist/chrome",
    });

    expect(isSetupState(state)).toBe(true);
  });

  it("saves and reloads valid state", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-state-"));
    const stateFile = resolve(tempDir, "setup-state.json");
    const state = createEmptySetupState({
      installVersion: "0.1.0",
      installRoot: "/repo",
      activeWrapperPath: "/home/tester/.local/share/broc/bin/broc",
      managedProfilePath: "/profiles/chromium",
      distDir: "/repo/dist",
      bridgePath: "/repo/dist/bridge.mjs",
      mcpServerPath: "/repo/dist/mcp-server.mjs",
      chromeExtensionDir: "/repo/dist/chrome",
    });

    state.browsers.firefox = {
      browser: "firefox",
      profilePath: "/profiles/firefox",
      runtime: "system-firefox",
      executablePath: "/usr/bin/firefox",
      preparedAt: new Date().toISOString(),
      nativeManifestBrowsers: ["firefox"],
      manifestMode: "global",
    };

    await saveSetupState(stateFile, state);
    const loaded = await loadSetupState(stateFile, loadOptions);
    expect(loaded).not.toBeNull();
    expect(loaded?.browsers.firefox?.profilePath).toBe("/profiles/firefox");

    const content = JSON.parse(await readFile(stateFile, "utf-8")) as { schemaVersion: number };
    expect(content.schemaVersion).toBe(2);
  });

  it("migrates legacy schema-1 state into schema-2 shape", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-state-"));
    const stateFile = resolve(tempDir, "setup-state.json");

    await writeFile(stateFile, JSON.stringify({
      schemaVersion: 1,
      repoRoot: "/repo",
      updatedAt: "2026-03-14T00:00:00.000Z",
      dist: {
        root: "/repo/dist",
        bridgePath: "/repo/dist/bridge.mjs",
        mcpServerPath: "/repo/dist/mcp-server.mjs",
        firefoxExtensionDir: "/repo/dist/firefox",
        chromeExtensionDir: "/repo/dist/chrome",
      },
      nativeManifestOwners: {
        chromium: ["chromium"],
      },
      browsers: {
        chromium: {
          browser: "chromium",
          profilePath: "/profiles/chromium",
          runtime: "managed-chromium",
          executablePath: "/cache/chromium/chrome",
          preparedAt: "2026-03-14T00:00:00.000Z",
          nativeManifestBrowsers: ["chromium"],
        },
      },
      managedChromium: {
        browser: "chromium",
        buildId: "123",
        executablePath: "/cache/chromium/chrome",
        cacheDir: "/cache/chromium",
        installedAt: "2026-03-14T00:00:00.000Z",
      },
    }, null, 2));

    const loaded = await loadSetupState(stateFile, loadOptions);
    expect(loaded).not.toBeNull();
    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.installVersion).toBe("repo-dev");
    expect(loaded?.installRoot).toBe("/repo");
    expect(loaded?.activeWrapperPath).toBe(loadOptions.activeWrapperPath);
    expect(loaded?.managedProfilePath).toBe("/profiles/chromium");
    expect(loaded?.migratedFromLegacy).toBe(true);
    expect(loaded?.browsers.chromium?.manifestMode).toBe("both");
  });

  it("rejects invalid state content", () => {
    expect(isSetupState({ installRoot: "/repo" })).toBe(false);
  });
});
