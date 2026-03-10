import { access, chmod, mkdir, readFile, unlink, writeFile } from "fs/promises";
import { homedir, platform } from "os";
import { resolve } from "path";
import type { BrowserType } from "./types.js";

const CHROME_EXTENSION_ID = "jmdfepifjgmfnngjdkceknidfmaeoeie";
const FIREFOX_EXTENSION_ID = "broc@anthropic.ai";

export function getNativeManifestDependencies(browserType: BrowserType): BrowserType[] {
  switch (browserType) {
    case "firefox":
      return ["firefox"];
    case "chromium":
      return ["chromium"];
    case "chrome":
      return ["chrome", "chromium"];
  }
}

export function collectNativeManifestTargets(browserTypes: BrowserType[]): BrowserType[] {
  return [...new Set(browserTypes.flatMap((browserType) => getNativeManifestDependencies(browserType)))];
}

export function getNativeManifestDir(browserType: BrowserType): string {
  const osName = platform();
  const home = homedir();

  switch (browserType) {
    case "firefox":
      switch (osName) {
        case "linux":
          return resolve(home, ".mozilla", "native-messaging-hosts");
        case "darwin":
          return resolve(home, "Library", "Application Support", "Mozilla", "NativeMessagingHosts");
        case "win32":
          return resolve(process.env.APPDATA || resolve(home, "AppData", "Roaming"), "Mozilla", "NativeMessagingHosts");
        default:
          throw new Error(`Unsupported platform: ${osName}`);
      }
    case "chrome":
      switch (osName) {
        case "linux":
          return resolve(home, ".config", "google-chrome", "NativeMessagingHosts");
        case "darwin":
          return resolve(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
        case "win32":
          return resolve(process.env.APPDATA || resolve(home, "AppData", "Roaming"), "Google", "Chrome", "NativeMessagingHosts");
        default:
          throw new Error(`Unsupported platform: ${osName}`);
      }
    case "chromium":
      switch (osName) {
        case "linux":
          return resolve(home, ".config", "chromium", "NativeMessagingHosts");
        case "darwin":
          return resolve(home, "Library", "Application Support", "Chromium", "NativeMessagingHosts");
        case "win32":
          return resolve(process.env.APPDATA || resolve(home, "AppData", "Roaming"), "Chromium", "NativeMessagingHosts");
        default:
          throw new Error(`Unsupported platform: ${osName}`);
      }
  }
}

export function getNativeManifestPath(browserType: BrowserType): string {
  return resolve(getNativeManifestDir(browserType), "broc.json");
}

export function getProfileNativeManifestDir(profilePath: string): string {
  return resolve(profilePath, "Default", "NativeMessagingHosts");
}

export function getProfileNativeManifestPath(profilePath: string): string {
  return resolve(getProfileNativeManifestDir(profilePath), "broc.json");
}

export function buildNativeManifest(browserType: BrowserType, bridgePath: string): Record<string, unknown> {
  const base = {
    name: "broc",
    description: "Broc native messaging host for AI agent interaction",
    path: bridgePath,
    type: "stdio",
  };

  if (browserType === "firefox") {
    return { ...base, allowed_extensions: [FIREFOX_EXTENSION_ID] };
  }

  return { ...base, allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`] };
}

export async function ensureBridgeExecutable(bridgePath: string): Promise<void> {
  await access(bridgePath);
  try {
    await chmod(bridgePath, 0o755);
  } catch {
    // Windows does not need chmod.
  }
}

export async function installNativeManifests(
  browserTypes: BrowserType[],
  bridgePath: string,
): Promise<Partial<Record<BrowserType, string>>> {
  await ensureBridgeExecutable(bridgePath);

  const installed: Partial<Record<BrowserType, string>> = {};
  for (const browserType of browserTypes) {
    const manifestDir = getNativeManifestDir(browserType);
    const manifestPath = getNativeManifestPath(browserType);
    const manifest = buildNativeManifest(browserType, bridgePath);

    await mkdir(manifestDir, { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    installed[browserType] = manifestPath;
  }

  return installed;
}

export async function installProfileNativeManifest(
  profilePath: string,
  bridgePath: string,
): Promise<string> {
  await ensureBridgeExecutable(bridgePath);

  const manifestDir = getProfileNativeManifestDir(profilePath);
  const manifestPath = getProfileNativeManifestPath(profilePath);
  const manifest = buildNativeManifest("chromium", bridgePath);

  await mkdir(manifestDir, { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return manifestPath;
}

export async function removeNativeManifest(browserType: BrowserType): Promise<boolean> {
  const manifestPath = getNativeManifestPath(browserType);
  try {
    await unlink(manifestPath);
    return true;
  } catch {
    return false;
  }
}

export async function readInstalledNativeManifest(browserType: BrowserType): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(getNativeManifestPath(browserType), "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readProfileNativeManifest(profilePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(getProfileNativeManifestPath(profilePath), "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}
