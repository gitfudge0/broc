import { describe, expect, it } from "vitest";
import pkg from "../../package.json";

describe("package.json scripts", () => {
  it("exposes the dev helper scripts", () => {
    expect(Object.keys(pkg.scripts)).toEqual([
      "dev",
      "dev:build",
      "dev:launch",
      "test",
      "build",
      "clean",
      "setup",
      "launch",
    ]);
  });

  it("uses concurrently for the top-level dev runner", () => {
    expect(pkg.scripts.dev).toContain("concurrently");
    expect(pkg.scripts.dev).toContain("npm:dev:build");
    expect(pkg.scripts.dev).toContain("npm:dev:launch");
    expect(pkg.scripts.dev).toContain("-P");
    expect(pkg.scripts.dev).toContain("-- {@}");
  });

  it("uses nodemon to restart the launch session on artifact changes", () => {
    expect(pkg.scripts["dev:launch"]).toContain("wait-on");
    expect(pkg.scripts["dev:launch"]).toContain("nodemon");
    expect(pkg.scripts["dev:launch"]).toContain("--watch dist/mcp-server.mjs");
    expect(pkg.scripts["dev:launch"]).toContain("--exec \"npm run launch -- --browser=chrome\"");
  });
});
