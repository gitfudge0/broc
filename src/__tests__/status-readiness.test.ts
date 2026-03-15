import { describe, expect, it } from "vitest";
import { evaluateBrowserReadiness } from "../cli/status.js";
import type { BrowserSetupState } from "../cli/state.js";

function chromiumState(manifestMode: "profile" | "both"): BrowserSetupState {
  return {
    browser: "chromium",
    profilePath: "/profiles/chromium",
    runtime: "managed-chromium",
    executablePath: "/cache/chromium/chrome",
    preparedAt: new Date().toISOString(),
    nativeManifestBrowsers: ["chromium"],
    manifestMode,
  };
}

describe("browser readiness", () => {
  it("treats profile-local manifest as sufficient for staged Chromium installs", () => {
    const readiness = evaluateBrowserReadiness({
      browser: "chromium",
      browserState: chromiumState("profile"),
      buildReady: true,
      profileReady: true,
      executableReady: true,
      profileManifestPresent: true,
      installedManifestPresence: {
        chromium: false,
      },
    });

    expect(readiness.launchReady).toBe(true);
    expect(readiness.globalManifests).toEqual([{
      browser: "chromium",
      present: false,
      required: false,
    }]);
  });

  it("fails staged Chromium readiness when the profile-local manifest is missing", () => {
    const readiness = evaluateBrowserReadiness({
      browser: "chromium",
      browserState: chromiumState("profile"),
      buildReady: true,
      profileReady: true,
      executableReady: true,
      profileManifestPresent: false,
      installedManifestPresence: {
        chromium: true,
      },
    });

    expect(readiness.launchReady).toBe(false);
    expect(readiness.profileManifestRequired).toBe(true);
  });
});
