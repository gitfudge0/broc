import { getNativeManifestDependencies } from "./native-host.js";
import type { BrowserManifestMode, BrowserSetupState } from "./state.js";
import type { BrowserType } from "./types.js";

export interface BrowserManifestStatus {
  browser: BrowserType;
  present: boolean;
  required: boolean;
}

export interface BrowserReadiness {
  manifestMode: BrowserManifestMode;
  globalManifests: BrowserManifestStatus[];
  profileManifestRequired: boolean;
  profileManifestPresent: boolean;
  launchReady: boolean;
}

export function resolveManifestMode(
  browser: BrowserType,
  browserState?: BrowserSetupState,
): BrowserManifestMode {
  return browserState?.manifestMode ?? (browser === "firefox" ? "global" : "both");
}

export function evaluateBrowserReadiness(params: {
  browser: BrowserType;
  browserState?: BrowserSetupState;
  buildReady: boolean;
  profileReady: boolean;
  executableReady: boolean;
  profileManifestPresent: boolean;
  installedManifestPresence: Partial<Record<BrowserType, boolean>>;
}): BrowserReadiness {
  const manifestMode = resolveManifestMode(params.browser, params.browserState);
  const manifestBrowsers = params.browserState?.nativeManifestBrowsers ?? getNativeManifestDependencies(params.browser);
  const requiresGlobalManifest = manifestMode === "global" || manifestMode === "both";
  const profileManifestRequired = params.browser !== "firefox" && (manifestMode === "profile" || manifestMode === "both");

  const globalManifests = manifestBrowsers.map((browser) => ({
    browser,
    present: !!params.installedManifestPresence[browser],
    required: requiresGlobalManifest,
  }));

  const globalManifestReady = requiresGlobalManifest
    ? globalManifests.every((entry) => entry.present)
    : true;
  const profileManifestReady = profileManifestRequired
    ? params.profileManifestPresent
    : true;

  return {
    manifestMode,
    globalManifests,
    profileManifestRequired,
    profileManifestPresent: params.profileManifestPresent,
    launchReady: params.buildReady &&
      !!params.browserState &&
      params.profileReady &&
      params.executableReady &&
      globalManifestReady &&
      profileManifestReady,
  };
}
