import { spawn, spawnSync } from "child_process";
import { access, cp, mkdir, readdir, readFile, rename, rm, writeFile } from "fs/promises";
import { resolve } from "path";
import type { AppPaths, RepoPaths } from "./paths.js";
import { getInstallRoot, getRepoPaths } from "./paths.js";
import { installProfileNativeManifest, removeNativeManifest } from "./native-host.js";
import { ensurePathSetup, removeManagedPathBlocks } from "./path-setup.js";
import { normalizeProfilePath } from "./profile-paths.js";
import { installPublicExecutable, removePublicExecutable } from "./public-bin.js";
import {
  ensureManagedChromium,
  ensureProfileDir,
  isProfileLocked,
  removeManagedChromium,
  resolveExecutable,
} from "./runtime.js";
import { createEmptySetupState, loadSetupState, saveSetupState, type SetupState } from "./state.js";
import type { PathSetupResult, PublicBinInstallResult } from "./types.js";

export interface ActiveInstallRecord {
  installVersion: string;
  installRoot: string;
  updatedAt: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
) => Promise<void>;

function getLoadStateOptions(appPaths: AppPaths) {
  return {
    activeWrapperPath: appPaths.wrapperPath,
    defaultManagedProfilePath: normalizeProfilePath(appPaths.profilesDir, "chromium"),
  };
}

export async function removeDirIfEmpty(path: string): Promise<void> {
  try {
    const entries = await readdir(path);
    if (entries.length === 0) {
      await rm(path, { recursive: true, force: true });
    }
  } catch {
    // Ignore missing or unreadable directories during best-effort cleanup.
  }
}

export async function removeLegacyNativeManifests(): Promise<void> {
  await Promise.all([
    removeNativeManifest("firefox"),
    removeNativeManifest("chrome"),
    removeNativeManifest("chromium"),
  ]);
}

export async function ensureAppDirs(appPaths: AppPaths): Promise<void> {
  await Promise.all([
    mkdir(appPaths.configDir, { recursive: true }),
    mkdir(appPaths.cacheDir, { recursive: true }),
    mkdir(appPaths.dataDir, { recursive: true }),
    mkdir(appPaths.profilesDir, { recursive: true }),
    mkdir(appPaths.runtimesDir, { recursive: true }),
    mkdir(appPaths.installsDir, { recursive: true }),
    mkdir(appPaths.binDir, { recursive: true }),
  ]);
}

export async function resolveInstallVersion(repoPaths: RepoPaths): Promise<string> {
  const packageJsonPath = resolve(repoPaths.repoRoot, "package.json");
  const raw = await readFile(packageJsonPath, "utf-8");
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version || "0.0.0";
}

export async function readActiveInstall(appPaths: AppPaths): Promise<ActiveInstallRecord | null> {
  try {
    const raw = await readFile(appPaths.activeInstallFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ActiveInstallRecord>;
    if (
      typeof parsed.installVersion !== "string" ||
      typeof parsed.installRoot !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return parsed as ActiveInstallRecord;
  } catch {
    return null;
  }
}

async function writeActiveInstall(appPaths: AppPaths, record: ActiveInstallRecord): Promise<void> {
  await mkdir(appPaths.dataDir, { recursive: true });
  await writeFile(appPaths.activeInstallFile, JSON.stringify(record, null, 2) + "\n");
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
    });

    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(signal
        ? `${command} exited with signal ${signal}`
        : `${command} exited with code ${code ?? 1}`));
    });
  });
}

export async function writeWrapper(appPaths: AppPaths): Promise<void> {
  const wrapperSource = `#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve } from "path";
import { spawn } from "child_process";

const activeInstallFile = ${JSON.stringify(appPaths.activeInstallFile)};
const active = JSON.parse(readFileSync(activeInstallFile, "utf-8"));
const cliPath = resolve(active.installRoot, "dist", "cli.mjs");
const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env },
});

child.once("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
`;

  await mkdir(appPaths.binDir, { recursive: true });
  await writeFile(appPaths.wrapperPath, wrapperSource);
  await access(appPaths.wrapperPath);
  await import("fs/promises").then(({ chmod }) => chmod(appPaths.wrapperPath, 0o755));
}

export async function installStagedRuntimeDependencies(
  installRoot: string,
  deps: { runCommand?: CommandRunner } = {},
): Promise<void> {
  await (deps.runCommand ?? runCommand)(
    npmCommand(),
    ["ci", "--omit=dev", "--ignore-scripts", "--prefer-offline"],
    { cwd: installRoot },
  );
}

export async function promotePreparedInstall(
  installRoot: string,
  tempInstallRoot: string,
  backupInstallRoot = `${installRoot}.bak`,
): Promise<void> {
  await rm(backupInstallRoot, { recursive: true, force: true });

  const hadExistingInstall = await pathExists(installRoot);
  if (hadExistingInstall) {
    await rename(installRoot, backupInstallRoot);
  }

  try {
    await rename(tempInstallRoot, installRoot);
  } catch (error) {
    if (hadExistingInstall) {
      await rm(installRoot, { recursive: true, force: true }).catch(() => {});
      await rename(backupInstallRoot, installRoot).catch(() => {});
    }
    throw error;
  }

  if (hadExistingInstall) {
    await rm(backupInstallRoot, { recursive: true, force: true });
  }
}

export async function stageRuntimeArtifacts(
  appPaths: AppPaths,
  repoPaths: RepoPaths,
  installVersion: string,
  deps: { runCommand?: CommandRunner } = {},
): Promise<RepoPaths> {
  const installRoot = getInstallRoot(appPaths, installVersion);
  const tempInstallRoot = `${installRoot}.tmp`;
  const stagedDistDir = resolve(tempInstallRoot, "dist");
  const packageJsonPath = resolve(repoPaths.repoRoot, "package.json");
  const packageLockPath = resolve(repoPaths.repoRoot, "package-lock.json");

  await rm(tempInstallRoot, { recursive: true, force: true });
  await mkdir(stagedDistDir, { recursive: true });
  await cp(repoPaths.distDir, stagedDistDir, { recursive: true });
  await cp(packageJsonPath, resolve(tempInstallRoot, "package.json"));
  await cp(packageLockPath, resolve(tempInstallRoot, "package-lock.json"));

  try {
    await installStagedRuntimeDependencies(tempInstallRoot, deps);
    await promotePreparedInstall(installRoot, tempInstallRoot);
  } catch (error) {
    await rm(tempInstallRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return getRepoPaths(resolve(installRoot, "dist"));
}

export async function provisionStagedRuntime(
  appPaths: AppPaths,
  stagedPaths: RepoPaths,
  installVersion: string,
): Promise<SetupState> {
  const profilePath = normalizeProfilePath(appPaths.profilesDir, "chromium");
  const runtime = await ensureManagedChromium(appPaths);

  await ensureProfileDir(profilePath);
  await installProfileNativeManifest(profilePath, stagedPaths.bridgePath);

  const state = createEmptySetupState({
    installVersion,
    installRoot: stagedPaths.repoRoot,
    activeWrapperPath: appPaths.wrapperPath,
    managedProfilePath: profilePath,
    distDir: stagedPaths.distDir,
    bridgePath: stagedPaths.bridgePath,
    mcpServerPath: stagedPaths.mcpServerPath,
    chromeExtensionDir: stagedPaths.chromeExtensionDir,
  });

  state.managedChromium = runtime;
  state.browsers.chromium = {
    browser: "chromium",
    profilePath,
    runtime: "managed-chromium",
    executablePath: runtime.executablePath,
    preparedAt: new Date().toISOString(),
    nativeManifestBrowsers: ["chromium"],
    manifestMode: "profile",
  };

  return state;
}

export async function finalizeInstalledRuntime(
  appPaths: AppPaths,
  stagedPaths: RepoPaths,
  installVersion: string,
  state: SetupState,
  integration?: {
    publicBin?: PublicBinInstallResult;
    pathSetup?: PathSetupResult;
  },
): Promise<void> {
  state.integration = {
    publicExecutablePath: integration?.publicBin?.executablePath,
    pathBlockFiles: integration?.pathSetup?.updatedFiles ?? [],
  };
  await saveSetupState(appPaths.stateFile, state);
  await writeActiveInstall(appPaths, {
    installVersion,
    installRoot: stagedPaths.repoRoot,
    updatedAt: new Date().toISOString(),
  });
  await writeWrapper(appPaths);
}

export async function installFromRepoBuild(
  appPaths: AppPaths,
  repoPaths: RepoPaths,
  deps: {
    runCommand?: CommandRunner;
    provisionRuntime?: typeof provisionStagedRuntime;
    installPublicExecutable?: typeof installPublicExecutable;
    ensurePathSetup?: typeof ensurePathSetup;
  } = {},
): Promise<{
  installVersion: string;
  stagedPaths: RepoPaths;
  state: SetupState;
  publicBin: PublicBinInstallResult;
  pathSetup: PathSetupResult;
}> {
  await ensureAppDirs(appPaths);
  const installVersion = await resolveInstallVersion(repoPaths);
  const stagedPaths = await stageRuntimeArtifacts(appPaths, repoPaths, installVersion, {
    runCommand: deps.runCommand,
  });
  const state = await (deps.provisionRuntime ?? provisionStagedRuntime)(appPaths, stagedPaths, installVersion);
  const publicBin = await (deps.installPublicExecutable ?? installPublicExecutable)(appPaths.wrapperPath);
  const pathSetup = await (deps.ensurePathSetup ?? ensurePathSetup)(publicBin.publicBinDir);
  await finalizeInstalledRuntime(appPaths, stagedPaths, installVersion, state, { publicBin, pathSetup });
  return { installVersion, stagedPaths, state, publicBin, pathSetup };
}

export function buildMcpConfig(wrapperPath: string, client = "generic"): string {
  const generic = {
    mcpServers: {
      broc: {
        command: wrapperPath,
        args: ["serve"],
      },
    },
  };

  if (client === "opencode") {
    return JSON.stringify({
      broc: {
        type: "local",
        command: [wrapperPath, "serve"],
        enabled: true,
      },
    }, null, 2);
  }

  return JSON.stringify(generic, null, 2);
}

export function copyTextToClipboard(text: string): boolean {
  const candidates = process.platform === "darwin"
    ? [["pbcopy"]]
    : [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]];

  for (const [command, ...args] of candidates) {
    const result = spawnSync(command, args, {
      input: text,
      stdio: ["pipe", "ignore", "ignore"],
    });
    if (result.status === 0) {
      return true;
    }
  }

  return false;
}

export function canCopyTextToClipboard(env: NodeJS.ProcessEnv = process.env): boolean {
  const candidates = process.platform === "darwin"
    ? ["pbcopy"]
    : ["wl-copy", "xclip", "xsel"];
  return candidates.some((command) => !!resolveExecutable(command, env));
}

export async function resetInstalledRuntime(appPaths: AppPaths): Promise<void> {
  const state = await loadSetupState(appPaths.stateFile, getLoadStateOptions(appPaths));
  const managedProfilePath = state?.managedProfilePath || normalizeProfilePath(appPaths.profilesDir, "chromium");
  const cleanupDeps = {
    loadState: loadSetupState,
    removeRuntime: removeManagedChromium,
    isProfileLocked,
    removeNativeManifests: removeLegacyNativeManifests,
  };
  return resetInstalledRuntimeWithDeps(appPaths, cleanupDeps, state, managedProfilePath);
}

export async function resetInstalledRuntimeWithDeps(
  appPaths: AppPaths,
  deps: {
    loadState?: typeof loadSetupState;
    removeRuntime?: typeof removeManagedChromium;
    isProfileLocked?: typeof isProfileLocked;
    removeNativeManifests?: typeof removeLegacyNativeManifests;
    removePublicExecutable?: typeof removePublicExecutable;
    removePathBlocks?: typeof removeManagedPathBlocks;
  } = {},
  preloadedState?: SetupState | null,
  managedProfilePathOverride?: string,
): Promise<void> {
  const state = preloadedState ?? await (deps.loadState ?? loadSetupState)(appPaths.stateFile);
  const managedProfilePath = managedProfilePathOverride
    ?? state?.managedProfilePath
    ?? normalizeProfilePath(appPaths.profilesDir, "chromium");

  if ((deps.isProfileLocked ?? isProfileLocked)(managedProfilePath)) {
    throw new Error("The managed Chromium profile appears to be in use. Close the browser before uninstalling Broc.");
  }

  if (state?.managedChromium) {
    await (deps.removeRuntime ?? removeManagedChromium)(state.managedChromium);
  }

  await (deps.removePublicExecutable ?? removePublicExecutable)(state?.integration?.publicExecutablePath);
  await (deps.removePathBlocks ?? removeManagedPathBlocks)(state?.integration?.pathBlockFiles);

  await Promise.all([
    rm(appPaths.activeInstallFile, { force: true }),
    rm(appPaths.wrapperPath, { force: true }),
    rm(appPaths.binDir, { recursive: true, force: true }),
    rm(appPaths.installsDir, { recursive: true, force: true }),
    rm(appPaths.profilesDir, { recursive: true, force: true }),
    rm(appPaths.runtimesDir, { recursive: true, force: true }),
    rm(appPaths.stateFile, { force: true }),
  ]);

  await (deps.removeNativeManifests ?? removeLegacyNativeManifests)().catch(() => {});
  await Promise.all([
    removeDirIfEmpty(appPaths.configDir),
    removeDirIfEmpty(appPaths.cacheDir),
    removeDirIfEmpty(appPaths.dataDir),
  ]);
}
