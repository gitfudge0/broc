import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChromiumLaunchPlan, buildFirefoxLaunchPlan, DEFAULT_LAUNCH_URL, spawnLaunchPlan } from "../cli/launch.js";
import type { RepoPaths } from "../cli/paths.js";
import type { BrowserSetupState, ManagedChromiumState } from "../cli/state.js";

vi.mock("child_process", () => ({
  spawn: vi.fn(() => ({ pid: 999 })),
}));
describe("launch plan builders", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("builds the Firefox web-ext launch command", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-launch-"));
    const webExtBinaryPath = resolve(tempDir, "web-ext");
    await writeFile(webExtBinaryPath, "#!/bin/sh\n");

    const repoPaths: RepoPaths = {
      repoRoot: "/repo",
      distDir: "/repo/dist",
      bridgePath: "/repo/dist/bridge.mjs",
      mcpServerPath: "/repo/dist/mcp-server.mjs",
      cliPath: "/repo/dist/cli.mjs",
      firefoxExtensionDir: "/repo/dist/firefox",
      chromeExtensionDir: "/repo/dist/chrome",
      webExtConfigPath: "/repo/web-ext.config.mjs",
      webExtBinaryPath,
    };
    const browserState: BrowserSetupState = {
      browser: "firefox",
      profilePath: "/profiles/firefox",
      runtime: "system-firefox",
      executablePath: "/usr/bin/firefox",
      preparedAt: new Date().toISOString(),
      nativeManifestBrowsers: ["firefox"],
    };

    const plan = await buildFirefoxLaunchPlan(repoPaths, browserState, "https://example.com");
    expect(plan.command).toBe(webExtBinaryPath);
    expect(plan.args).toContain("--firefox-profile");
    expect(plan.args).toContain("/profiles/firefox");
    expect(plan.args).toContain("https://example.com");
  });

  it("defaults Firefox launch to google.com when no URL is provided", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-launch-"));
    const webExtBinaryPath = resolve(tempDir, "web-ext");
    await writeFile(webExtBinaryPath, "#!/bin/sh\n");

    const repoPaths: RepoPaths = {
      repoRoot: "/repo",
      distDir: "/repo/dist",
      bridgePath: "/repo/dist/bridge.mjs",
      mcpServerPath: "/repo/dist/mcp-server.mjs",
      cliPath: "/repo/dist/cli.mjs",
      firefoxExtensionDir: "/repo/dist/firefox",
      chromeExtensionDir: "/repo/dist/chrome",
      webExtConfigPath: "/repo/web-ext.config.mjs",
      webExtBinaryPath,
    };
    const browserState: BrowserSetupState = {
      browser: "firefox",
      profilePath: "/profiles/firefox",
      runtime: "system-firefox",
      executablePath: "/usr/bin/firefox",
      preparedAt: new Date().toISOString(),
      nativeManifestBrowsers: ["firefox"],
    };

    const plan = await buildFirefoxLaunchPlan(repoPaths, browserState);
    expect(plan.args).toContain(DEFAULT_LAUNCH_URL);
  });

  it("builds the Chromium launch command with extension flags", () => {
    const repoPaths: RepoPaths = {
      repoRoot: "/repo",
      distDir: "/repo/dist",
      bridgePath: "/repo/dist/bridge.mjs",
      mcpServerPath: "/repo/dist/mcp-server.mjs",
      cliPath: "/repo/dist/cli.mjs",
      firefoxExtensionDir: "/repo/dist/firefox",
      chromeExtensionDir: "/repo/dist/chrome",
      webExtConfigPath: "/repo/web-ext.config.mjs",
      webExtBinaryPath: "/repo/node_modules/.bin/web-ext",
    };
    const browserState: BrowserSetupState = {
      browser: "chromium",
      profilePath: "/profiles/chromium",
      runtime: "managed-chromium",
      executablePath: "/cache/chromium/chrome",
      preparedAt: new Date().toISOString(),
      nativeManifestBrowsers: ["chromium"],
    };
    const runtime: ManagedChromiumState = {
      browser: "chromium",
      buildId: "1234",
      executablePath: "/cache/chromium/chrome",
      cacheDir: "/cache/chromium",
      installedAt: new Date().toISOString(),
    };

    const plan = buildChromiumLaunchPlan(repoPaths, browserState, runtime);
    expect(plan.command).toBe("/cache/chromium/chrome");
    expect(plan.args).toContain("--no-first-run");
    expect(plan.args).toContain("--no-default-browser-check");
    expect(plan.args.some((arg) => arg.includes("--load-extension=/repo/dist/chrome"))).toBe(true);
  });

  it("defaults Chromium launch to google.com when no URL is provided", () => {
    const repoPaths: RepoPaths = {
      repoRoot: "/repo",
      distDir: "/repo/dist",
      bridgePath: "/repo/dist/bridge.mjs",
      mcpServerPath: "/repo/dist/mcp-server.mjs",
      cliPath: "/repo/dist/cli.mjs",
      firefoxExtensionDir: "/repo/dist/firefox",
      chromeExtensionDir: "/repo/dist/chrome",
      webExtConfigPath: "/repo/web-ext.config.mjs",
      webExtBinaryPath: "/repo/node_modules/.bin/web-ext",
    };
    const browserState: BrowserSetupState = {
      browser: "chromium",
      profilePath: "/profiles/chromium",
      runtime: "managed-chromium",
      executablePath: "/cache/chromium/chrome",
      preparedAt: new Date().toISOString(),
      nativeManifestBrowsers: ["chromium"],
    };
    const runtime: ManagedChromiumState = {
      browser: "chromium",
      buildId: "1234",
      executablePath: "/cache/chromium/chrome",
      cacheDir: "/cache/chromium",
      installedAt: new Date().toISOString(),
    };

    const plan = buildChromiumLaunchPlan(repoPaths, browserState, runtime);
    expect(plan.args.at(-1)).toBe(DEFAULT_LAUNCH_URL);
  });

  it("spawns launch plans without blocking", () => {
    const child = spawnLaunchPlan({
      command: "/bin/browser",
      args: ["--flag"],
      cwd: "/repo",
      env: process.env,
    });
    expect(child).toEqual({ pid: 999 });
  });
});
