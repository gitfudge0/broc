export type BrowserType = "firefox" | "chrome" | "chromium";

export const VALID_BROWSERS: BrowserType[] = ["firefox", "chrome", "chromium"];

export function isBrowserType(value: string): value is BrowserType {
  return VALID_BROWSERS.includes(value as BrowserType);
}
