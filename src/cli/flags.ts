import { VALID_BROWSERS, isBrowserType, type BrowserType } from "./types.js";

export function parseNoMcpFlag(argv: string[]): boolean {
  return argv.includes("--no-mcp");
}

export function parseJsonFlag(argv: string[]): boolean {
  return argv.includes("--json");
}

export function parseBrowserFlag(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  {
    logError = console.error,
    exit = process.exit,
  }: {
    logError?: (message: string) => void;
    exit?: (code?: number) => never;
  } = {},
): BrowserType | undefined {
  const browserArgs = argv.filter((arg) => arg.startsWith("--browser="));
  const browserArg = browserArgs.at(-1);
  const envValue = env.npm_config_browser === "true" ? undefined : env.npm_config_browser;
  const value = browserArg ? browserArg.split("=")[1] : envValue;

  if (!value) {
    return undefined;
  }

  const normalizedValue = value.toLowerCase();
  if (isBrowserType(normalizedValue)) {
    return normalizedValue;
  }

  logError(`Invalid browser: ${normalizedValue}. Must be one of: ${VALID_BROWSERS.join(", ")}`);
  exit(1);
}
