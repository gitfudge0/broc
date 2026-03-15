import { describe, expect, it } from "vitest";
import { renderInstallSummary } from "../cli/install-summary.js";

describe("install summary", () => {
  it("renders detected clients and generic fallback", () => {
    const text = renderInstallSummary({
      installVersion: "1.2.3",
      installRoot: "/installs/1.2.3",
      managedRuntimePath: "/cache/chromium/chrome",
      wrapperPath: "/managed/bin/broc",
      publicExecutablePath: "/home/tester/.local/bin/broc",
      pathSetup: {
        publicBinDir: "/home/tester/.local/bin",
        alreadyOnPath: false,
        updatedFiles: ["/home/tester/.zshrc"],
        manualInstructions: [],
        activationHint: "Run 'source /home/tester/.zshrc' or open a new shell before using broc.",
        warnings: [],
      },
      detectedClients: [{
        client: "codex",
        status: "detected",
        method: "config",
        evidence: "/home/tester/.codex/config.toml",
      }],
      copySupported: true,
    });

    expect(text).toContain("public broc");
    expect(text).toContain("Detected MCP clients:");
    expect(text).toContain("Codex");
    expect(text).toContain("broc mcp-config --client=codex --copy");
    expect(text).toContain("broc mcp-config --client=generic --copy");
  });

  it("renders a generic-only fallback when nothing is detected", () => {
    const text = renderInstallSummary({
      installVersion: "1.2.3",
      installRoot: "/installs/1.2.3",
      managedRuntimePath: null,
      wrapperPath: "/managed/bin/broc",
      publicExecutablePath: "/home/tester/.local/bin/broc",
      pathSetup: {
        publicBinDir: "/home/tester/.local/bin",
        alreadyOnPath: true,
        updatedFiles: [],
        manualInstructions: [],
        activationHint: null,
        warnings: [],
      },
      detectedClients: [],
      copySupported: false,
    });

    expect(text).toContain("Detected MCP clients: none");
    expect(text).toContain("broc mcp-config --client=generic");
    expect(text).not.toContain("--copy");
  });
});
