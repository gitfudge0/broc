import { resolve, sep } from "path";

export function profileName(browser: "firefox" | "chrome" | "chromium"): string {
  return browser;
}

export function normalizeProfilePath(baseDir: string, browser: "firefox" | "chrome" | "chromium"): string {
  return resolve(baseDir, profileName(browser));
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const normalizedParent = parentPath.endsWith(sep) ? parentPath : parentPath + sep;
  return childPath.startsWith(normalizedParent);
}
