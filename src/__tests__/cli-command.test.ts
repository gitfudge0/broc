import { describe, expect, it } from "vitest";
import { resolveCliCommand, stripResolvedCommand } from "../cli/command.js";
import { parseNoMcpFlag } from "../cli/flags.js";

describe("resolveCliCommand", () => {
  it("defaults to empty command for bare broc", () => {
    expect(resolveCliCommand([])).toBe("");
  });

  it("defaults to empty command when only flags are present", () => {
    expect(resolveCliCommand(["--url=https://example.com", "--no-mcp"])).toBe("");
  });

  it("resolves an explicit launch command after flags", () => {
    expect(resolveCliCommand(["--url=https://example.com", "launch"])).toBe("launch");
  });

  it("resolves serve as the explicit command", () => {
    expect(resolveCliCommand(["serve"])).toBe("serve");
  });

  it("leaves unknown commands for the router to reject", () => {
    expect(resolveCliCommand(["wat"])).toBe("wat");
  });
});

describe("stripResolvedCommand", () => {
  it("preserves bare-command flags when no command is present", () => {
    const argv = ["--url=https://example.com", "--no-mcp"];
    expect(stripResolvedCommand(argv, "")).toEqual(argv);
    expect(parseNoMcpFlag(stripResolvedCommand(argv, ""))).toBe(true);
  });

  it("removes only the resolved command token", () => {
    expect(stripResolvedCommand(["--url=https://example.com", "serve"], "serve")).toEqual(["--url=https://example.com"]);
  });
});
