import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptySetupState,
  isSetupState,
  loadSetupState,
  saveSetupState,
} from "../cli/state.js";

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
      repoRoot: "/repo",
      distDir: "/repo/dist",
      bridgePath: "/repo/dist/bridge.mjs",
      mcpServerPath: "/repo/dist/mcp-server.mjs",
      firefoxExtensionDir: "/repo/dist/firefox",
      chromeExtensionDir: "/repo/dist/chrome",
    });

    expect(isSetupState(state)).toBe(true);
  });

  it("saves and reloads valid state", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "browser-control-state-"));
    const stateFile = resolve(tempDir, "setup-state.json");
    const state = createEmptySetupState({
      repoRoot: "/repo",
      distDir: "/repo/dist",
      bridgePath: "/repo/dist/bridge.mjs",
      mcpServerPath: "/repo/dist/mcp-server.mjs",
      firefoxExtensionDir: "/repo/dist/firefox",
      chromeExtensionDir: "/repo/dist/chrome",
    });

    state.browsers.firefox = {
      browser: "firefox",
      profilePath: "/profiles/firefox",
      runtime: "system-firefox",
      executablePath: "/usr/bin/firefox",
      preparedAt: new Date().toISOString(),
      nativeManifestBrowsers: ["firefox"],
    };

    await saveSetupState(stateFile, state);
    const loaded = await loadSetupState(stateFile);
    expect(loaded).not.toBeNull();
    expect(loaded?.browsers.firefox?.profilePath).toBe("/profiles/firefox");

    const content = JSON.parse(await readFile(stateFile, "utf-8")) as { schemaVersion: number };
    expect(content.schemaVersion).toBe(1);
  });

  it("rejects invalid state content", () => {
    expect(isSetupState({ repoRoot: "/repo" })).toBe(false);
  });
});
