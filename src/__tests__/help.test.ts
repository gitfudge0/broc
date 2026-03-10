import { describe, expect, it } from "vitest";
import { buildHelpText } from "../cli/help.js";

describe("buildHelpText", () => {
  it("documents launch as the combined browser and MCP command", () => {
    const text = buildHelpText();
    expect(text).toContain("launch       Launch a browser and start the MCP server");
    expect(text).toContain("--no-mcp");
    expect(text).toContain("--json");
    expect(text).toContain("browser_status MCP tool");
    expect(text).toContain("npm run launch -- --browser=firefox");
  });
});
