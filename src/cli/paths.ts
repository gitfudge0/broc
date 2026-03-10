import { homedir, platform } from "os";
import { resolve } from "path";

export interface AppPaths {
  configDir: string;
  cacheDir: string;
  profilesDir: string;
  runtimesDir: string;
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
      return {
        configDir: resolve(homeDir, ".config", "browser-control"),
        cacheDir: resolve(homeDir, ".cache", "browser-control"),
        profilesDir: resolve(homeDir, ".config", "browser-control", "profiles"),
        runtimesDir: resolve(homeDir, ".cache", "browser-control", "runtimes"),
        stateFile: resolve(homeDir, ".config", "browser-control", "setup-state.json"),
      };
    case "darwin":
      return {
        configDir: resolve(homeDir, "Library", "Application Support", "browser-control"),
        cacheDir: resolve(homeDir, "Library", "Caches", "browser-control"),
        profilesDir: resolve(homeDir, "Library", "Application Support", "browser-control", "profiles"),
        runtimesDir: resolve(homeDir, "Library", "Caches", "browser-control", "runtimes"),
        stateFile: resolve(homeDir, "Library", "Application Support", "browser-control", "setup-state.json"),
      };
    case "win32": {
      const appData = env.APPDATA || resolve(homeDir, "AppData", "Roaming");
      const localAppData = env.LOCALAPPDATA || resolve(homeDir, "AppData", "Local");
      return {
        configDir: resolve(appData, "browser-control"),
        cacheDir: resolve(localAppData, "browser-control", "Cache"),
        profilesDir: resolve(appData, "browser-control", "profiles"),
        runtimesDir: resolve(localAppData, "browser-control", "Cache", "runtimes"),
        stateFile: resolve(appData, "browser-control", "setup-state.json"),
      };
    }
    default:
      throw new Error(`Unsupported platform: ${osName}`);
  }
}

export function getAppPaths(): AppPaths {
  return getAppPathsFor(platform(), process.env, homedir());
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
