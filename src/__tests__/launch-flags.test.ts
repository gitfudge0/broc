import { describe, expect, it } from "vitest";
import { parseJsonFlag, parseNoMcpFlag } from "../cli/flags.js";

describe("parseNoMcpFlag", () => {
  it("defaults to starting the MCP server", () => {
    expect(parseNoMcpFlag(["launch", "--browser=firefox"])).toBe(false);
  });

  it("disables MCP startup when --no-mcp is present", () => {
    expect(parseNoMcpFlag(["launch", "--browser=firefox", "--no-mcp"])).toBe(true);
  });
});

describe("parseJsonFlag", () => {
  it("defaults to false when --json is absent", () => {
    expect(parseJsonFlag(["status"])).toBe(false);
  });

  it("enables JSON output when --json is present", () => {
    expect(parseJsonFlag(["status", "--json"])).toBe(true);
  });
});
