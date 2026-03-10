import { describe, expect, it } from "vitest";
import pkg from "../../package.json";

describe("package.json scripts", () => {
  it("exposes the reduced six-script surface", () => {
    expect(Object.keys(pkg.scripts)).toEqual([
      "dev",
      "test",
      "build",
      "clean",
      "setup",
      "launch",
    ]);
  });
});
