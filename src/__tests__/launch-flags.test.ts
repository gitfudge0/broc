import { describe, expect, it } from "vitest";
import { parseBrowserFlag, parseClientFlag, parseCopyFlag, parseJsonFlag, parseNoMcpFlag } from "../cli/flags.js";

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

describe("parseCopyFlag", () => {
  it("detects --copy", () => {
    expect(parseCopyFlag(["mcp-config", "--copy"])).toBe(true);
  });
});

describe("parseClientFlag", () => {
  it("defaults to generic", () => {
    expect(parseClientFlag(["mcp-config"])).toBe("generic");
  });

  it("parses a supported client", () => {
    expect(parseClientFlag(["mcp-config", "--client=codex"])).toBe("codex");
  });

  it("parses opencode as a supported client", () => {
    expect(parseClientFlag(["mcp-config", "--client=opencode"])).toBe("opencode");
  });
});

describe("parseBrowserFlag", () => {
  it("prefers the last explicit argv browser over npm config env", () => {
    expect(parseBrowserFlag(["launch", "--browser=chrome", "--browser=firefox"], { npm_config_browser: "chromium" })).toBe("firefox");
  });

  it("accepts npm config browser when argv omits it", () => {
    expect(parseBrowserFlag(["launch"], { npm_config_browser: "firefox" })).toBe("firefox");
  });

  it("ignores npm config browser=true from npm's boolean config parsing", () => {
    expect(parseBrowserFlag(["launch"], { npm_config_browser: "true" })).toBeUndefined();
  });

  it("exits with the existing validation error for invalid env values", () => {
    const errors: string[] = [];
    const exit = (() => {
      throw new Error("exit");
    }) as (code?: number) => never;

    expect(() => parseBrowserFlag(["launch"], { npm_config_browser: "invalid" }, {
      logError: (message) => errors.push(message),
      exit,
    })).toThrow("exit");
    expect(errors).toEqual([
      "Invalid browser: invalid. Must be one of: firefox, chrome, chromium",
    ]);
  });
});
