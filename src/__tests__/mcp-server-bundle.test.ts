import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("mcp server bundle", () => {
  it("keeps puppeteer browser download code out of the MCP server bundle", async () => {
    const result = await build({
      entryPoints: ["src/mcp/server.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      write: false,
      logLevel: "silent",
      external: ["@modelcontextprotocol/sdk/*", "zod", "@puppeteer/browsers"],
    });

    const output = result.outputFiles[0].text;
    expect(output).not.toContain("@puppeteer/browsers");
    expect(output).not.toContain("proxy-agent");
  });
});
