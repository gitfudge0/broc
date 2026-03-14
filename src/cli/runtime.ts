import {
  Browser,
  BrowserTag,
  computeExecutablePath,
  detectBrowserPlatform,
  install,
  resolveBuildId,
  uninstall,
} from "@puppeteer/browsers";
import { accessSync, existsSync } from "fs";
import { mkdir, rm } from "fs/promises";
import { delimiter, resolve } from "path";
import type { AppPaths } from "./paths.js";
import type { ManagedChromiumState } from "./state.js";

export function resolveExecutable(candidate: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const pathValue = env.PATH || "";
  const hasPathSeparator = candidate.includes("/") || candidate.includes("\\");
  const extensions = process.platform === "win32"
    ? (env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  const checkPath = (value: string): string | null => {
    if (existsSync(value)) {
      try {
        accessSync(value);
        return value;
      } catch {
        return null;
      }
    }
    return null;
  };

  const expandCandidate = (value: string): string[] => {
    if (process.platform !== "win32" || /\.[^\\/]+$/.test(value)) {
      return [value];
    }
    return extensions.map((ext) => value + ext.toLowerCase());
  };

  if (hasPathSeparator) {
    for (const expanded of expandCandidate(candidate)) {
      const absolute = resolve(expanded);
      const found = checkPath(absolute);
      if (found) return found;
    }
    return null;
  }

  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const expanded of expandCandidate(resolve(dir, candidate))) {
      const found = checkPath(expanded);
      if (found) return found;
    }
  }

  return null;
}

export function resolveFirefoxExecutable(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.FIREFOX) {
    return resolveExecutable(env.FIREFOX, env);
  }
  return resolveExecutable("firefox", env);
}

export async function ensureProfileDir(profilePath: string): Promise<void> {
  await mkdir(profilePath, { recursive: true });
}

export async function ensureManagedChromium(appPaths: AppPaths): Promise<ManagedChromiumState> {
  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error("Could not determine a supported Chromium download target for this platform.");
  }

  const cacheDir = resolve(appPaths.runtimesDir, "chromium");
  await mkdir(cacheDir, { recursive: true });

  const buildId = await resolveBuildId(Browser.CHROMIUM, platform, BrowserTag.LATEST);
  await install({
    browser: Browser.CHROMIUM,
    buildId,
    cacheDir,
  });

  const executablePath = computeExecutablePath({
    browser: Browser.CHROMIUM,
    buildId,
    cacheDir,
  });

  return {
    browser: "chromium",
    buildId,
    executablePath,
    cacheDir,
    installedAt: new Date().toISOString(),
  };
}

export async function removeManagedChromium(runtime: ManagedChromiumState): Promise<void> {
  if (!runtime.buildId || !runtime.cacheDir) return;

  const platform = detectBrowserPlatform();
  if (platform) {
    await uninstall({
      browser: Browser.CHROMIUM,
      buildId: runtime.buildId,
      cacheDir: runtime.cacheDir,
      platform,
    }).catch(() => {});
  }

  await rm(runtime.cacheDir, { recursive: true, force: true });
}

export function isProfileLocked(profilePath: string): boolean {
  const lockFiles = process.platform === "win32"
    ? ["lock", "parent.lock"]
    : ["parent.lock", ".parentlock"];
  return lockFiles.some((lockFile) => existsSync(resolve(profilePath, lockFile)));
}
