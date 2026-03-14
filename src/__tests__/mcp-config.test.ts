import { describe, expect, it } from "vitest";
import { buildMcpConfig } from "../cli/bootstrap.js";

describe("buildMcpConfig", () => {
  it("emits serve-based MCP config for generic clients", () => {
    const parsed = JSON.parse(buildMcpConfig("/managed/bin/broc"));
    expect(parsed).toEqual({
      mcpServers: {
        broc: {
          command: "/managed/bin/broc",
          args: ["serve"],
        },
      },
    });
  });

  it("emits local command-array config for opencode", () => {
    const parsed = JSON.parse(buildMcpConfig("/managed/bin/broc", "opencode"));
    expect(parsed).toEqual({
      broc: {
        type: "local",
        command: ["/managed/bin/broc", "serve"],
        enabled: true,
      },
    });
  });
});
