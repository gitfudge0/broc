import { homedir, platform } from "os";
import { resolve } from "path";

export interface AppPaths {
  configDir: string;
  cacheDir: string;
  dataDir: string;
  profilesDir: string;
  runtimesDir: string;
  installsDir: string;
  binDir: string;
  wrapperPath: string;
  activeInstallFile: string;
  stateFile: string;
}

export interface RepoPaths {
  repoRoot: string;
  distDir: string;
  bridgePath: string;
  mcpServerPath: string;
  cliPath: string;
  firefoxExtensionDir: string;
  chromeExtensionDir: string;
  webExtConfigPath: string;
  webExtBinaryPath: string;
}

export function getAppPathsFor(
  osName: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  homeDir: string,
): AppPaths {
  switch (osName) {
    case "linux":
      {
        const dataHome = env.XDG_DATA_HOME || resolve(homeDir, ".local", "share");
        const configDir = resolve(homeDir, ".config", "broc");
        const cacheDir = resolve(homeDir, ".cache", "broc");
        const dataDir = resolve(dataHome, "broc");
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
    case "darwin":
      {
        const dataDir = resolve(homeDir, "Library", "Application Support", "broc");
        const cacheDir = resolve(homeDir, "Library", "Caches", "broc");
        return {
          configDir: dataDir,
          cacheDir,
          dataDir,
          profilesDir: resolve(dataDir, "profiles"),
          runtimesDir: resolve(cacheDir, "runtimes"),
          installsDir: resolve(dataDir, "installs"),
          binDir: resolve(dataDir, "bin"),
          wrapperPath: resolve(dataDir, "bin", "broc"),
          activeInstallFile: resolve(dataDir, "active-install.json"),
          stateFile: resolve(dataDir, "setup-state.json"),
        };
      }
    case "win32": {
      const appData = env.APPDATA || resolve(homeDir, "AppData", "Roaming");
      const localAppData = env.LOCALAPPDATA || resolve(homeDir, "AppData", "Local");
      return {
        configDir: resolve(appData, "broc"),
        cacheDir: resolve(localAppData, "broc", "Cache"),
        dataDir: resolve(localAppData, "broc", "Data"),
        profilesDir: resolve(appData, "broc", "profiles"),
        runtimesDir: resolve(localAppData, "broc", "Cache", "runtimes"),
        installsDir: resolve(localAppData, "broc", "Data", "installs"),
        binDir: resolve(localAppData, "broc", "Data", "bin"),
        wrapperPath: resolve(localAppData, "broc", "Data", "bin", "broc.cmd"),
        activeInstallFile: resolve(localAppData, "broc", "Data", "active-install.json"),
        stateFile: resolve(appData, "broc", "setup-state.json"),
      };
    }
    default:
      throw new Error(`Unsupported platform: ${osName}`);
  }
}

export function getAppPaths(): AppPaths {
  return getAppPathsFor(platform(), process.env, homedir());
}

export function getInstallRoot(appPaths: AppPaths, installVersion: string): string {
  return resolve(appPaths.installsDir, installVersion);
}

export function getRepoPaths(distDir: string): RepoPaths {
  const repoRoot = resolve(distDir, "..");
  const webExtBinaryName = process.platform === "win32" ? "web-ext.cmd" : "web-ext";
  return {
    repoRoot,
    distDir,
    bridgePath: resolve(distDir, "bridge.mjs"),
    mcpServerPath: resolve(distDir, "mcp-server.mjs"),
    cliPath: resolve(distDir, "cli.mjs"),
    firefoxExtensionDir: resolve(distDir, "firefox"),
    chromeExtensionDir: resolve(distDir, "chrome"),
    webExtConfigPath: resolve(repoRoot, "web-ext.config.mjs"),
    webExtBinaryPath: resolve(repoRoot, "node_modules", ".bin", webExtBinaryName),
  };
}
