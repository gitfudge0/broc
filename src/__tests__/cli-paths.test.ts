import { describe, expect, it } from "vitest";
import { getAppPathsFor } from "../cli/paths.js";

describe("getAppPathsFor", () => {
  it("returns Linux config and cache paths", () => {
    const paths = getAppPathsFor("linux", {}, "/home/tester");
    expect(paths.configDir).toBe("/home/tester/.config/broc");
    expect(paths.cacheDir).toBe("/home/tester/.cache/broc");
    expect(paths.stateFile).toBe("/home/tester/.config/broc/setup-state.json");
  });

  it("returns macOS config and cache paths", () => {
    const paths = getAppPathsFor("darwin", {}, "/Users/tester");
    expect(paths.configDir).toBe("/Users/tester/Library/Application Support/broc");
    expect(paths.cacheDir).toBe("/Users/tester/Library/Caches/broc");
  });

  it("returns Windows config and cache paths", () => {
    const paths = getAppPathsFor(
      "win32",
      { APPDATA: "C:\\Users\\tester\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" },
      "C:\\Users\\tester",
    );
    expect(paths.configDir).toContain("AppData");
    expect(paths.cacheDir).toContain("Cache");
    expect(paths.stateFile).toContain("setup-state.json");
  });
});
