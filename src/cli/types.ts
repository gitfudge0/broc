export type BrowserType = "firefox" | "chrome" | "chromium";
export type McpClientType = "generic" | "claude-code" | "codex";

export const VALID_BROWSERS: BrowserType[] = ["firefox", "chrome", "chromium"];
export const VALID_MCP_CLIENTS: McpClientType[] = ["generic", "claude-code", "codex"];

export function isBrowserType(value: string): value is BrowserType {
  return VALID_BROWSERS.includes(value as BrowserType);
}

export function isMcpClientType(value: string): value is McpClientType {
  return VALID_MCP_CLIENTS.includes(value as McpClientType);
}
