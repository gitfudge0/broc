import { describe, expect, it } from "vitest";
import {
  collectNativeManifestTargets,
  getProfileNativeManifestPath,
  getNativeManifestDependencies,
} from "../cli/native-host.js";

describe("native manifest planning", () => {
  it("adds chromium manifest dependency for chrome launches", () => {
    expect(getNativeManifestDependencies("chrome")).toEqual(["chrome", "chromium"]);
  });

  it("deduplicates manifest targets across browser setup", () => {
    expect(collectNativeManifestTargets(["chrome", "chromium", "firefox"])).toEqual([
      "chrome",
      "chromium",
      "firefox",
    ]);
  });

  it("places managed-browser native manifests inside the profile root", () => {
    expect(getProfileNativeManifestPath("/tmp/broc/chrome")).toBe(
      "/tmp/broc/chrome/Default/NativeMessagingHosts/broc.json",
    );
  });
});
