import { describe, expect, it } from "vitest";
import { buildHelpText } from "../cli/help.js";

describe("buildHelpText", () => {
  it("shows only the supported end-user commands and relevant options", () => {
    const text = buildHelpText();
    expect(text).toContain("Broc browser control");
    expect(text).toContain("(none), serve     Start the MCP server only");
    expect(text).toContain("launch            Launch the managed Chromium browser");
    expect(text).toContain("status            Show runtime and bridge status");
    expect(text).toContain("mcp-config        Print MCP config for the installed broc command");
    expect(text).toContain("snapshot          Print a snapshot of the current page");
    expect(text).toContain("uninstall         Remove the installed runtime and managed browser data");
    expect(text).toContain("reset             Alias for uninstall");
    expect(text).toContain("--no-mcp");
    expect(text).toContain("--client=<name>");
    expect(text).toContain("opencode");
    expect(text).toContain("status options:");
    expect(text).toContain("snapshot options:");
    expect(text).not.toContain("Quick Start:");
    expect(text).not.toContain("Uninstall:");
    expect(text).not.toContain("Notes:");
    expect(text).not.toContain("repo/dev compatibility");
    expect(text).not.toContain("browser_status MCP tool");
    expect(text).not.toContain("./scripts/install.sh");
  });
});
