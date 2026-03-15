import { spawn, type ChildProcess } from "child_process";
import { access, rm } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { BridgeClient, getPidPath, getSocketPath, isBridgeRunning } from "./mcp/bridge-client.js";
import { resolveCliCommand, stripResolvedCommand } from "./cli/command.js";
import {
  buildChromiumLaunchPlan,
  buildFirefoxLaunchPlan,
  DEFAULT_LAUNCH_URL,
  spawnLaunchPlan,
  waitForBridgeReady,
  waitForChildSpawn,
} from "./cli/launch.js";
import {
  getNativeManifestDependencies,
  getNativeManifestPath,
  getProfileNativeManifestPath,
  installNativeManifests,
  installProfileNativeManifest,
  readInstalledNativeManifest,
  readProfileNativeManifest,
  removeNativeManifest,
} from "./cli/native-host.js";
import { getAppPaths, getRepoPaths } from "./cli/paths.js";
import {
  buildMcpConfig,
  canCopyTextToClipboard,
  copyTextToClipboard,
  ensureAppDirs,
  installFromRepoBuild,
  resetInstalledRuntime,
} from "./cli/bootstrap.js";
import { detectInstalledClients } from "./cli/client-detect.js";
import { normalizeProfilePath } from "./cli/profile-paths.js";
import { renderInstallSummary } from "./cli/install-summary.js";
import {
  createEmptySetupState,
  deleteSetupState,
  hasPreparedBrowsers,
  loadSetupState,
  saveSetupState,
  type SetupState,
} from "./cli/state.js";
import {
  ensureManagedChromium,
  ensureProfileDir,
  isProfileLocked,
  removeManagedChromium,
  resolveFirefoxExecutable,
} from "./cli/runtime.js";
import { routeCliCommand } from "./cli/router.js";
import { snapshotCommand } from "./cli/snapshot.js";
import { evaluateBrowserReadiness } from "./cli/status.js";
import { VALID_BROWSERS, isBrowserType, type BrowserType } from "./cli/types.js";
import { parseBrowserFlag, parseClientFlag, parseCopyFlag, parseJsonFlag, parseNoMcpFlag } from "./cli/flags.js";
import { orchestrateLaunchSession } from "./cli/session.js";
import { buildHelpText } from "./cli/help.js";
import { collectBrowserStatusReport } from "./shared/bridge-status.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoPaths = getRepoPaths(__dirname);
const appPaths = getAppPaths();

function getLoadStateOptions() {
  return {
    activeWrapperPath: appPaths.wrapperPath,
    defaultManagedProfilePath: normalizeProfilePath(appPaths.profilesDir, "chromium"),
  };
}

function parseUrlFlag(argv: string[]): string | undefined {
  const urlArg = argv.find((arg) => arg.startsWith("--url="));
  if (!urlArg) return undefined;
  return urlArg.slice("--url=".length);
}

function stopProcess(child: { kill(signal?: NodeJS.Signals): boolean } | null | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!child) return;
  try {
    child.kill(signal);
  } catch {
    // Ignore already-exited child processes.
  }
}

function resolveLaunchUrl(url?: string): string {
  return url || DEFAULT_LAUNCH_URL;
}

interface ExtensionStatusInfo {
  extensionVersion: string;
  protocolVersion: number;
  capabilities: {
    openTab: boolean;
  };
}

function isUnknownRequestError(response: { type?: string; error?: { message?: string } }, requestType: string): boolean {
  return response.type === "error" && response.error?.message === `Unknown request type: ${requestType}`;
}

function targetBrowsers(browserFlag: BrowserType | undefined): BrowserType[] {
  return browserFlag ? [browserFlag] : [...VALID_BROWSERS];
}

async function ensureDistReady(options: { includeFirefox?: boolean } = {}): Promise<void> {
  const required = buildArtifactPaths(options);

  for (const path of required) {
    try {
      await access(path);
    } catch {
      console.error("Error: Build artifacts are missing.");
      console.error("Run 'npm run build' or the repo wrapper 'npm run setup' first.");
      process.exit(1);
    }
  }
}

function buildArtifactPaths(options: { includeFirefox?: boolean } = {}): string[] {
  const required = [
    repoPaths.bridgePath,
    repoPaths.mcpServerPath,
    resolve(repoPaths.chromeExtensionDir, "manifest.json"),
  ];

  if (options.includeFirefox) {
    required.push(resolve(repoPaths.firefoxExtensionDir, "manifest.json"));
  }

  return required;
}

async function loadRepoSetupState(): Promise<SetupState | null> {
  const state = await loadSetupState(appPaths.stateFile, getLoadStateOptions());
  if (!state) return null;
  if (state.installRoot !== repoPaths.repoRoot && state.dist.root !== repoPaths.distDir) return null;
  return state;
}

function getOrCreateState(existing: SetupState | null): SetupState {
  return existing ?? createEmptySetupState({
    installVersion: "repo-dev",
    installRoot: repoPaths.repoRoot,
    activeWrapperPath: appPaths.wrapperPath,
    managedProfilePath: normalizeProfilePath(appPaths.profilesDir, "chromium"),
    distDir: repoPaths.distDir,
    bridgePath: repoPaths.bridgePath,
    mcpServerPath: repoPaths.mcpServerPath,
    chromeExtensionDir: repoPaths.chromeExtensionDir,
  });
}

function addNativeManifestOwner(state: SetupState, manifestBrowser: BrowserType, owner: BrowserType): void {
  const owners = new Set(state.nativeManifestOwners[manifestBrowser] ?? []);
  owners.add(owner);
  state.nativeManifestOwners[manifestBrowser] = [...owners];
}

function removeNativeManifestOwner(state: SetupState, manifestBrowser: BrowserType, owner: BrowserType): void {
  const owners = new Set(state.nativeManifestOwners[manifestBrowser] ?? []);
  owners.delete(owner);
  if (owners.size === 0) {
    delete state.nativeManifestOwners[manifestBrowser];
  } else {
    state.nativeManifestOwners[manifestBrowser] = [...owners];
  }
}

function manifestTargetsForState(state: SetupState): BrowserType[] {
  return Object.keys(state.nativeManifestOwners).filter(isBrowserType);
}

function requireBrowserFlag(browserFlag: BrowserType | undefined, commandName: string): BrowserType {
  if (!browserFlag) {
    console.error(`Error: --browser=<${VALID_BROWSERS.join("|")}> is required for '${commandName}'.`);
    process.exit(1);
  }
  return browserFlag;
}

async function setupCommand(browsers: BrowserType[]): Promise<void> {
  await ensureDistReady({ includeFirefox: browsers.includes("firefox") });
  await ensureAppDirs(appPaths);

  const state = getOrCreateState(await loadRepoSetupState());
  const needsManagedChromium = browsers.some((browser) => browser === "chrome" || browser === "chromium");

  if (needsManagedChromium) {
    state.managedChromium = await ensureManagedChromium(appPaths);
  }

  for (const browser of browsers) {
    const nativeManifestBrowsers = getNativeManifestDependencies(browser);
    for (const manifestBrowser of nativeManifestBrowsers) {
      addNativeManifestOwner(state, manifestBrowser, browser);
    }

    if (browser === "firefox") {
      const executablePath = resolveFirefoxExecutable();
      if (!executablePath) {
        console.error("Error: Firefox was not found.");
        console.error("Install Firefox or set FIREFOX=/path/to/firefox before running setup.");
        process.exit(1);
      }
      const profilePath = normalizeProfilePath(appPaths.profilesDir, "firefox");
      await ensureProfileDir(profilePath);
      state.browsers.firefox = {
        browser: "firefox",
        profilePath,
        runtime: "system-firefox",
        executablePath,
        preparedAt: new Date().toISOString(),
        nativeManifestBrowsers,
        manifestMode: "global",
      };
      continue;
    }

    if (!state.managedChromium) {
      throw new Error("Managed Chromium was not prepared.");
    }

    const profilePath = normalizeProfilePath(appPaths.profilesDir, browser as "chrome" | "chromium");
    await ensureProfileDir(profilePath);
    await installProfileNativeManifest(profilePath, repoPaths.bridgePath);
    state.managedProfilePath = profilePath;
    state.browsers[browser] = {
      browser,
      profilePath,
      runtime: "managed-chromium",
      executablePath: state.managedChromium.executablePath,
      preparedAt: new Date().toISOString(),
      nativeManifestBrowsers,
      manifestMode: "both",
    };
  }

  const manifestTargets = manifestTargetsForState(state);
  await installNativeManifests(manifestTargets, repoPaths.bridgePath);
  await saveSetupState(appPaths.stateFile, state);

  console.log("Setup complete.");
  for (const browser of browsers) {
    console.log(`  ${browser}: ready`);
  }
  if (state.managedChromium) {
    console.log(`  managed runtime: ${state.managedChromium.executablePath}`);
  }
  console.log("Next steps:");
  console.log("  npm run launch -- --browser=<name>");
}

async function waitForBridgeConnection(timeoutMs = 5000): Promise<void> {
  await waitForBridgeReady({
    timeoutMs,
    isBridgeRunning,
    pingBridge: async () => {
      const client = new BridgeClient({ connectTimeout: 500, timeout: 1000 });
      try {
        await client.start();
        const pong = await client.ping(1000);
        return pong.alive;
      } finally {
        client.stop();
      }
    },
  });
}

async function isBuildReady(): Promise<boolean> {
  const checks = await Promise.allSettled(buildArtifactPaths().map((path) => access(path)));
  return checks.every((result) => result.status === "fulfilled");
}

async function buildBrowserStatusJson(): Promise<import("./shared/bridge-status.js").BrowserStatusReport> {
  const state = await loadRepoSetupState();
  const report = await collectBrowserStatusReport({
    buildReady: await isBuildReady(),
    setupStatePresent: !!state,
    bridge: {
      socketPath: getSocketPath(),
      pidPath: getPidPath(),
      pingBridge: async () => {
        const client = new BridgeClient({ connectTimeout: 500, timeout: 1000 });
        try {
          await client.start();
          const pong = await client.ping(1000);
          return pong.alive;
        } finally {
          client.stop();
        }
      },
    },
  });
  const extensionStatus = await getExtensionStatus().catch(() => null);
  if (extensionStatus) {
    report.bridge.extensionVersion = extensionStatus.extensionVersion;
    report.bridge.protocolVersion = extensionStatus.protocolVersion;
    report.bridge.capabilities = extensionStatus.capabilities;
    report.bridge.extensionCompatibility = "current";
  } else if (report.bridge.phase === "connected") {
    report.bridge.extensionCompatibility = "stale_or_unknown";
    report.bridge.remediation = [
      ...report.bridge.remediation.filter((entry) => entry !== "No action required."),
      "Rebuild and relaunch the browser so the managed extension worker refreshes to the current protocol.",
    ];
  }
  return report;
}

function spawnMcpServerProcess(): ChildProcess {
  return spawn("node", [repoPaths.mcpServerPath], {
    stdio: "inherit",
    env: { ...process.env },
  });
}

async function getExtensionStatus(): Promise<ExtensionStatusInfo | null> {
  const client = new BridgeClient({ connectTimeout: 1000, timeout: 3000 });
  try {
    await client.start();
    const response = await client.request({
      type: "extension_status",
    }) as {
      type: string;
      extensionVersion?: string;
      protocolVersion?: number;
      capabilities?: { openTab?: boolean };
      error?: { message?: string };
    };

    if (isUnknownRequestError(response, "extension_status")) {
      return null;
    }

    if (response.type !== "extension_status_result") {
      return null;
    }

    if (!response.extensionVersion || typeof response.protocolVersion !== "number") {
      return null;
    }

    return {
      extensionVersion: response.extensionVersion,
      protocolVersion: response.protocolVersion,
      capabilities: {
        openTab: !!response.capabilities?.openTab,
      },
    };
  } finally {
    client.stop();
  }
}

async function openLaunchTab(url: string): Promise<void> {
  const extensionStatus = await getExtensionStatus();
  if (!extensionStatus || !extensionStatus.capabilities.openTab) {
    console.warn("Warning: The running browser extension is older than this CLI build and does not support deterministic tab opening. Continuing with legacy launch behavior for this run.");
    return;
  }

  const client = new BridgeClient({ connectTimeout: 1000, timeout: 3000 });
  try {
    await client.start();
    const response = await client.request({
      type: "open_tab",
      url,
      active: true,
    }) as {
      type: string;
      tab?: { id: number; url: string; active: boolean; windowId: number };
      error?: { message?: string };
    };

    if (isUnknownRequestError(response, "open_tab")) {
      console.warn("Warning: The running browser extension is older than this CLI build and does not support deterministic tab opening. Continuing with legacy launch behavior for this run.");
      return;
    }

    if (response.type === "error") {
      throw new Error(response.error?.message || `Failed to open launch URL: ${url}`);
    }

    if (response.type !== "open_tab_result" || !response.tab?.id) {
      throw new Error(`Unexpected bridge response while opening launch URL: ${response.type}`);
    }
  } finally {
    client.stop();
  }
}

async function launchCommand(
  browser: BrowserType,
  url?: string,
  options: { startMcp?: boolean } = {},
): Promise<void> {
  const startMcp = options.startMcp ?? true;
  const launchUrl = resolveLaunchUrl(url);
  await ensureDistReady({ includeFirefox: browser === "firefox" });
  const state = await loadRepoSetupState();
  if (!state || !state.browsers[browser]) {
    console.error(`Error: ${browser} is not set up.`);
    console.error("Run './scripts/install.sh' or 'broc setup' first.");
    process.exit(1);
  }

  const browserState = state.browsers[browser]!;
  if (isProfileLocked(browserState.profilePath)) {
    console.error(`Error: The managed profile for ${browser} appears to be in use.`);
    console.error(`Close the existing ${browser} instance before launching again.`);
    process.exit(1);
  }

  let browserProcess: ChildProcess | null = null;

  if (browser === "firefox") {
    const plan = await buildFirefoxLaunchPlan(repoPaths, browserState, launchUrl);
    browserProcess = spawnLaunchPlan(plan);
  } else {
    if (!state.managedChromium) {
      console.error("Error: Managed Chromium runtime is not available.");
      console.error("Run './scripts/install.sh' or 'broc setup' first.");
      process.exit(1);
    }

    await installProfileNativeManifest(browserState.profilePath, repoPaths.bridgePath);
    const plan = buildChromiumLaunchPlan(repoPaths, browserState, state.managedChromium, launchUrl);
    browserProcess = spawnLaunchPlan(plan);
  }

  try {
    await orchestrateLaunchSession(
      { startMcp },
      {
        spawnBrowser: () => browserProcess!,
        spawnMcpServer: () => spawnMcpServerProcess(),
        waitForChildSpawn,
        waitForBridge: () => waitForBridgeConnection(5000),
        openLaunchUrl: () => openLaunchTab(launchUrl),
      },
    );
  } catch (error) {
    stopProcess(browserProcess, "SIGTERM");
    throw error;
  }

  if (!startMcp) {
    return;
  }
}

async function teardownCommand(browsers: BrowserType[]): Promise<void> {
  const state = await loadRepoSetupState();
  if (!state) {
    console.error("Error: No setup state exists for this checkout.");
    console.error("Run 'npm run setup -- --browser=<name>' first.");
    process.exit(1);
  }

  for (const browser of browsers) {
    const browserState = state.browsers[browser];
    if (browserState) {
      await rm(browserState.profilePath, { recursive: true, force: true });
      delete state.browsers[browser];
    }

    for (const manifestBrowser of getNativeManifestDependencies(browser)) {
      removeNativeManifestOwner(state, manifestBrowser, browser);
      if (!state.nativeManifestOwners[manifestBrowser]) {
        await removeNativeManifest(manifestBrowser);
      }
    }
  }

  const remainingChromeFamily = Object.keys(state.browsers).some((browser) => browser === "chrome" || browser === "chromium");
  if (!remainingChromeFamily && state.managedChromium) {
    await removeManagedChromium(state.managedChromium);
    delete state.managedChromium;
  }

  if (hasPreparedBrowsers(state)) {
    await saveSetupState(appPaths.stateFile, state);
  } else {
    await deleteSetupState(appPaths.stateFile);
  }

  console.log("Teardown complete.");
  for (const browser of browsers) {
    console.log(`  ${browser}: removed`);
  }
}

async function installCommand(browsers: BrowserType[]): Promise<void> {
  await ensureDistReady();
  await installNativeManifests(browsers, repoPaths.bridgePath);
  console.log("Legacy native-host install complete.");
  for (const browser of browsers) {
    console.log(`  ${browser}: ${getNativeManifestPath(browser)}`);
  }
  console.log("Use 'broc setup' for the full guided flow.");
}

async function uninstallNativeHostCommand(browsers: BrowserType[]): Promise<void> {
  for (const browser of browsers) {
    const removed = await removeNativeManifest(browser);
    console.log(`[${browser}] ${removed ? "Removed" : "Not installed"}: ${getNativeManifestPath(browser)}`);
  }
  console.log("Use 'broc teardown' to remove managed profiles and runtime state.");
}

async function statusCommand(browsers: BrowserType[], options: { json?: boolean } = {}): Promise<void> {
  const state = await loadRepoSetupState();
  const buildReady = await isBuildReady();
  const report = await buildBrowserStatusJson();

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Broc Status");
  console.log("======================");
  console.log("");
  console.log(`Build artifacts: ${buildReady ? "Ready" : "Missing"}`);
  console.log(`Setup state: ${state ? "Present" : "Not set up"}`);
  if (state) {
    console.log(`Install root: ${state.installRoot}`);
    console.log(`Wrapper: ${state.activeWrapperPath}`);
  }

  for (const browser of browsers) {
    const browserState = state?.browsers[browser];
    const manifestBrowsers = browserState?.nativeManifestBrowsers ?? getNativeManifestDependencies(browser);
    const manifestPresenceEntries = await Promise.all(
      manifestBrowsers.map(async (manifestBrowser) => ([
        manifestBrowser,
        !!await readInstalledNativeManifest(manifestBrowser),
      ] as const)),
    );
    const manifestPresence = Object.fromEntries(manifestPresenceEntries) as Partial<Record<BrowserType, boolean>>;
    const profileManifest = browserState && browser !== "firefox"
      ? await readProfileNativeManifest(browserState.profilePath)
      : null;
    const profileReady = browserState
      ? await access(browserState.profilePath).then(() => true).catch(() => false)
      : false;
    const executableReady = browserState
      ? await access(browserState.executablePath).then(() => true).catch(() => false)
      : false;
    const readiness = evaluateBrowserReadiness({
      browser,
      browserState,
      buildReady,
      profileReady,
      executableReady,
      profileManifestPresent: !!profileManifest,
      installedManifestPresence: manifestPresence,
    });

    console.log("");
    console.log(`[${browser}]`);
    console.log(`  Setup: ${browserState ? "Prepared" : "Not prepared"}`);
    console.log(`  Profile: ${profileReady ? browserState?.profilePath : "Missing"}`);
    console.log(`  Executable: ${executableReady ? browserState?.executablePath : "Missing"}`);
    console.log(`  Runtime: ${browser === "firefox" ? "system-firefox" : state?.managedChromium ? "managed-chromium" : "Missing"}`);
    if (browser !== "firefox") {
      const profileLabel = profileManifest
        ? getProfileNativeManifestPath(browserState!.profilePath)
        : "Missing";
      const profileSuffix = readiness.profileManifestRequired ? "" : " (optional)";
      console.log(`  Native manifest (profile-local): ${profileLabel}${profileSuffix}`);
    }
    for (const manifestStatus of readiness.globalManifests) {
      const suffix = manifestStatus.required ? "" : " (optional)";
      console.log(`  Native manifest (${manifestStatus.browser}): ${manifestStatus.present ? "Installed" : "Missing"}${suffix}`);
    }
    console.log(`  Launch ready: ${readiness.launchReady ? "Yes" : "No"}`);
  }

  console.log("");
  console.log(`Bridge: ${report.bridge.phase === "connected" ? "Connected" : `Degraded (${report.bridge.phase})`}`);
  console.log(`Bridge socket: ${report.bridge.socketPath}`);
  console.log(`Bridge PID:    ${report.bridge.pidPath}`);
  console.log(`Bridge running: ${isBridgeRunning() ? "Yes" : "No"}`);
  if (report.bridge.extensionVersion) {
    console.log(`Extension version: ${report.bridge.extensionVersion}`);
  }
  if (report.bridge.protocolVersion !== undefined) {
    console.log(`Extension protocol: ${report.bridge.protocolVersion}`);
  }
  if (report.bridge.extensionCompatibility) {
    console.log(`Extension compatibility: ${report.bridge.extensionCompatibility}`);
  }
  if (report.bridge.lastError) {
    console.log(`Bridge error: ${report.bridge.lastError}`);
  }
  if (report.bridge.phase !== "connected") {
    for (const entry of report.bridge.remediation) {
      console.log(`Remediation: ${entry}`);
    }
  }
  if (!state) {
    console.log("Run './scripts/install.sh' to prepare the managed runtime.");
    console.log("If Broc was already removed, './scripts/uninstall.sh' is not needed.");
  }
}

async function mcpConfigCommand(options: { client: ReturnType<typeof parseClientFlag>; copy: boolean }): Promise<void> {
  const config = buildMcpConfig(appPaths.wrapperPath, options.client);
  if (options.copy) {
    const copied = copyTextToClipboard(config);
    console.log(copied ? "Copied MCP config to the clipboard." : "Could not copy MCP config to the clipboard automatically.");
  }
  console.log(config);
}

async function fullUninstallCommand(): Promise<void> {
  await resetInstalledRuntime(appPaths);
  console.log("Broc uninstall complete.");
  console.log("  staged runtime removed");
  console.log("  managed Chromium removed");
  console.log("  managed profile removed");
  console.log("  public broc command removed");
  console.log("  managed PATH block removed");
  console.log("  repo checkout left intact");
  console.log("  remove the MCP client config snippet manually if you no longer want Broc configured");
}

async function stageInstallCommand(options: { client: ReturnType<typeof parseClientFlag>; copy: boolean }): Promise<void> {
  await ensureDistReady();
  const { installVersion, stagedPaths, state, publicBin, pathSetup } = await installFromRepoBuild(appPaths, repoPaths);
  const detectedClients = detectInstalledClients();
  const preferredClients = detectedClients.filter((client) => client.status !== "not_found");

  if (options.copy) {
    const preferredClient = preferredClients[0]?.client ?? options.client;
    const copied = copyTextToClipboard(buildMcpConfig(appPaths.wrapperPath, preferredClient));
    console.log(copied ? `Copied ${preferredClient} MCP config to the clipboard.` : "Could not copy MCP config to the clipboard automatically.");
  }

  console.log(renderInstallSummary({
    installVersion,
    installRoot: stagedPaths.repoRoot,
    managedRuntimePath: state.managedChromium?.executablePath ?? null,
    wrapperPath: appPaths.wrapperPath,
    publicExecutablePath: publicBin.executablePath,
    pathSetup,
    detectedClients,
    copySupported: canCopyTextToClipboard(),
  }));
}

async function startMcpServer(): Promise<void> {
  try {
    await access(repoPaths.mcpServerPath);
  } catch {
    console.error(`Error: MCP server not found at ${repoPaths.mcpServerPath}`);
    console.error("Run './scripts/install.sh' or build the runtime first.");
    process.exit(1);
  }

  const child = spawnMcpServerProcess();

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });

  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

async function showHelp(): Promise<void> {
  console.log(buildHelpText());
}

async function main(): Promise<void> {
  const rawArgv = process.argv.slice(2);
  const command = resolveCliCommand(rawArgv);
  const argv = stripResolvedCommand(rawArgv, command);
  const browserFlag = parseBrowserFlag(rawArgv, process.env);
  const browsers = targetBrowsers(browserFlag);
  const url = parseUrlFlag(rawArgv);
  const startMcp = !parseNoMcpFlag(rawArgv);
  const jsonOutput = parseJsonFlag(rawArgv);
  const client = parseClientFlag(rawArgv);
  const copy = parseCopyFlag(rawArgv);

  await routeCliCommand(command, {
    setup: () => setupCommand(browsers),
    launch: () => launchCommand(browserFlag ?? "chromium", url, { startMcp }),
    serve: () => startMcpServer(),
    teardown: () => teardownCommand(browsers),
    install: () => installCommand(browsers),
    uninstall: () => fullUninstallCommand(),
    uninstallNativeHost: () => uninstallNativeHostCommand(browsers),
    status: () => statusCommand(browsers, { json: jsonOutput }),
    mcpConfig: () => mcpConfigCommand({ client, copy }),
    reset: () => fullUninstallCommand(),
    stageInstall: () => stageInstallCommand({ client, copy }),
    snapshot: () => snapshotCommand(argv),
    help: () => showHelp(),
    unknown: async (unknownCommand: string) => {
      console.error(`Unknown command: ${unknownCommand}`);
      console.error('Run "broc help" for usage.');
      process.exit(1);
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
