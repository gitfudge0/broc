import { describe, expect, it } from "vitest";

describe("repo-cli wrapper planning", () => {
  it("builds before setup", async () => {
    const { planRepoCli } = await import("../../scripts/repo-cli.mjs");
    expect(planRepoCli(["setup", "--browser=firefox"])).toEqual({
      command: "setup",
      args: ["--browser=firefox"],
      needsBuild: true,
      needsDist: false,
    });
  });

  it("requires existing dist for launch", async () => {
    const { planRepoCli } = await import("../../scripts/repo-cli.mjs");
    expect(planRepoCli(["launch", "--browser=chromium"])).toEqual({
      command: "launch",
      args: ["--browser=chromium"],
      needsBuild: false,
      needsDist: true,
    });
  });
});
