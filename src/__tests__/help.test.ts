import { describe, expect, it } from "vitest";
import { buildHelpText } from "../cli/help.js";

describe("buildHelpText", () => {
  it("documents launch as the combined browser and MCP command", () => {
    const text = buildHelpText();
    expect(text).toContain("launch       Launch the managed Chromium browser and start the MCP server");
    expect(text).toContain("--no-mcp");
    expect(text).toContain("--json");
    expect(text).toContain("--client=<name>");
    expect(text).toContain("mcp-config");
    expect(text).toContain("reset        Fully uninstall");
    expect(text).toContain("browser_status MCP tool");
    expect(text).toContain("./scripts/install.sh");
    expect(text).toContain("./scripts/uninstall.sh");
    expect(text).toContain("repo/dev compatibility only");
  });
});
