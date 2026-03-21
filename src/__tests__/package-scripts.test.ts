import { describe, expect, it } from "vitest";
import pkg from "../../package.json";

describe("package.json scripts", () => {
  it("exposes the dev helper scripts", () => {
    expect(Object.keys(pkg.scripts)).toEqual([
      "dev",
      "dev:build",
      "dev:launch",
      "dev:notebook",
      "dev:notebook:build",
      "dev:notebook:serve",
      "test",
      "build",
      "build:notebook",
      "build:runtime",
      "clean",
      "install:local",
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

  it("exposes a notebook-only dev loop", () => {
    expect(pkg.scripts["build:notebook"]).toContain("node build.mjs --notebook");
    expect(pkg.scripts["dev:notebook:build"]).toContain("node build.mjs --watch --notebook");
    expect(pkg.scripts["dev:notebook:serve"]).toContain("wait-on dist/notebook-server.mjs");
    expect(pkg.scripts["dev:notebook:serve"]).toContain("node dist/notebook-server.mjs");
    expect(pkg.scripts["dev:notebook"]).toContain("npm:dev:notebook:build");
    expect(pkg.scripts["dev:notebook"]).toContain("npm:dev:notebook:serve");
  });
});
