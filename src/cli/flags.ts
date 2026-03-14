import {
  VALID_BROWSERS,
  VALID_MCP_CLIENTS,
  isBrowserType,
  isMcpClientType,
  type BrowserType,
  type McpClientType,
} from "./types.js";

export function parseNoMcpFlag(argv: string[]): boolean {
  return argv.includes("--no-mcp");
}

export function parseJsonFlag(argv: string[]): boolean {
  return argv.includes("--json");
}

export function parseCopyFlag(argv: string[]): boolean {
  return argv.includes("--copy");
}

export function parseClientFlag(
  argv: string[],
  {
    logError = console.error,
    exit = process.exit,
  }: {
    logError?: (message: string) => void;
    exit?: (code?: number) => never;
  } = {},
): McpClientType {
  const clientArg = argv.filter((arg) => arg.startsWith("--client=")).at(-1);
  if (!clientArg) {
    return "generic";
  }

  const value = clientArg.slice("--client=".length).toLowerCase();
  if (isMcpClientType(value)) {
    return value;
  }

  logError(`Invalid client: ${value}. Must be one of: ${VALID_MCP_CLIENTS.join(", ")}`);
  exit(1);
  throw new Error("Unreachable");
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
