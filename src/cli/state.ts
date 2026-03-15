import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname } from "path";
import type { BrowserType } from "./types.js";

const SCHEMA_VERSION = 3;
const PREVIOUS_SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;

export type BrowserManifestMode = "global" | "profile" | "both";

export interface ManagedChromiumState {
  browser: "chromium";
  buildId: string;
  executablePath: string;
  cacheDir: string;
  installedAt: string;
}

export interface BrowserSetupState {
  browser: BrowserType;
  profilePath: string;
  runtime: "system-firefox" | "managed-chromium";
  executablePath: string;
  preparedAt: string;
  nativeManifestBrowsers: BrowserType[];
  manifestMode: BrowserManifestMode;
}

export interface SetupState {
  schemaVersion: number;
  installVersion: string;
  installRoot: string;
  activeWrapperPath: string;
  managedProfilePath: string;
  updatedAt: string;
  dist: {
    root: string;
    bridgePath: string;
    mcpServerPath: string;
    chromeExtensionDir: string;
  };
  nativeManifestOwners: Partial<Record<BrowserType, BrowserType[]>>;
  browsers: Partial<Record<BrowserType, BrowserSetupState>>;
  managedChromium?: ManagedChromiumState;
  integration?: {
    publicExecutablePath?: string;
    pathBlockFiles?: string[];
  };
  migratedFromLegacy?: boolean;
}

interface PreviousSetupState {
  schemaVersion: number;
  installVersion: string;
  installRoot: string;
  activeWrapperPath: string;
  managedProfilePath: string;
  updatedAt: string;
  dist: {
    root: string;
    bridgePath: string;
    mcpServerPath: string;
    chromeExtensionDir: string;
  };
  nativeManifestOwners: Partial<Record<BrowserType, BrowserType[]>>;
  browsers: Partial<Record<BrowserType, BrowserSetupState>>;
  managedChromium?: ManagedChromiumState;
  integration?: {
    publicExecutablePath?: string;
    pathBlockFiles?: string[];
  };
  migratedFromLegacy?: boolean;
}

export interface RepoStateShape {
  installVersion: string;
  installRoot: string;
  activeWrapperPath: string;
  managedProfilePath: string;
  distDir: string;
  bridgePath: string;
  mcpServerPath: string;
  chromeExtensionDir: string;
}

interface LegacyBrowserSetupState {
  browser: BrowserType;
  profilePath: string;
  runtime: "system-firefox" | "managed-chromium";
  executablePath: string;
  preparedAt: string;
  nativeManifestBrowsers: BrowserType[];
}

interface LegacySetupState {
  schemaVersion: number;
  repoRoot: string;
  updatedAt: string;
  dist: {
    root: string;
    bridgePath: string;
    mcpServerPath: string;
    firefoxExtensionDir?: string;
    chromeExtensionDir: string;
  };
  nativeManifestOwners: Partial<Record<BrowserType, BrowserType[]>>;
  browsers: Partial<Record<BrowserType, LegacyBrowserSetupState>>;
  managedChromium?: ManagedChromiumState;
}

export interface LoadSetupStateOptions {
  activeWrapperPath: string;
  defaultManagedProfilePath: string;
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isBrowserOwnerMap(value: unknown): value is Partial<Record<BrowserType, BrowserType[]>> {
  if (!isStringRecord(value)) return false;
  return Object.values(value).every((entry) =>
    Array.isArray(entry) && entry.every((item) => typeof item === "string")
  );
}

function isBrowserSetupState(value: unknown): value is BrowserSetupState {
  if (!isStringRecord(value)) return false;
  return typeof value.browser === "string" &&
    typeof value.profilePath === "string" &&
    typeof value.runtime === "string" &&
    typeof value.executablePath === "string" &&
    typeof value.preparedAt === "string" &&
    Array.isArray(value.nativeManifestBrowsers) &&
    isBrowserManifestMode(value.manifestMode);
}

function isLegacyBrowserSetupState(value: unknown): value is LegacyBrowserSetupState {
  if (!isStringRecord(value)) return false;
  return typeof value.browser === "string" &&
    typeof value.profilePath === "string" &&
    typeof value.runtime === "string" &&
    typeof value.executablePath === "string" &&
    typeof value.preparedAt === "string" &&
    Array.isArray(value.nativeManifestBrowsers);
}

function isManagedChromiumState(value: unknown): value is ManagedChromiumState {
  if (!isStringRecord(value)) return false;
  return value.browser === "chromium" &&
    typeof value.buildId === "string" &&
    typeof value.executablePath === "string" &&
    typeof value.cacheDir === "string" &&
    typeof value.installedAt === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isIntegrationState(value: unknown): value is NonNullable<SetupState["integration"]> {
  if (value === undefined) return true;
  if (!isStringRecord(value)) return false;
  if (value.publicExecutablePath !== undefined && typeof value.publicExecutablePath !== "string") return false;
  if (value.pathBlockFiles !== undefined && !isStringArray(value.pathBlockFiles)) return false;
  return true;
}

export function isSetupState(value: unknown): value is SetupState {
  if (!isStringRecord(value)) return false;
  if (value.schemaVersion !== SCHEMA_VERSION) return false;
  if (
    typeof value.installVersion !== "string" ||
    typeof value.installRoot !== "string" ||
    typeof value.activeWrapperPath !== "string" ||
    typeof value.managedProfilePath !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return false;
  }
  if (!isStringRecord(value.dist)) return false;
  if (typeof value.dist.root !== "string") return false;
  if (typeof value.dist.bridgePath !== "string") return false;
  if (typeof value.dist.mcpServerPath !== "string") return false;
  if (typeof value.dist.chromeExtensionDir !== "string") return false;
  if (!isBrowserOwnerMap(value.nativeManifestOwners)) return false;
  if (!isStringRecord(value.browsers)) return false;
  if (!Object.values(value.browsers).every((entry) => entry === undefined || isBrowserSetupState(entry))) return false;
  if (value.managedChromium !== undefined && !isManagedChromiumState(value.managedChromium)) return false;
  if (!isIntegrationState(value.integration)) return false;
  return true;
}

function isPreviousSetupState(value: unknown): value is PreviousSetupState {
  if (!isStringRecord(value)) return false;
  if (value.schemaVersion !== PREVIOUS_SCHEMA_VERSION) return false;
  if (
    typeof value.installVersion !== "string" ||
    typeof value.installRoot !== "string" ||
    typeof value.activeWrapperPath !== "string" ||
    typeof value.managedProfilePath !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return false;
  }
  if (!isStringRecord(value.dist)) return false;
  if (typeof value.dist.root !== "string") return false;
  if (typeof value.dist.bridgePath !== "string") return false;
  if (typeof value.dist.mcpServerPath !== "string") return false;
  if (typeof value.dist.chromeExtensionDir !== "string") return false;
  if (!isBrowserOwnerMap(value.nativeManifestOwners)) return false;
  if (!isStringRecord(value.browsers)) return false;
  if (!Object.values(value.browsers).every((entry) => entry === undefined || isBrowserSetupState(entry))) return false;
  if (value.managedChromium !== undefined && !isManagedChromiumState(value.managedChromium)) return false;
  return true;
}

function isLegacySetupState(value: unknown): value is LegacySetupState {
  if (!isStringRecord(value)) return false;
  if (value.schemaVersion !== LEGACY_SCHEMA_VERSION) return false;
  if (typeof value.repoRoot !== "string" || typeof value.updatedAt !== "string") return false;
  if (!isStringRecord(value.dist)) return false;
  if (typeof value.dist.root !== "string") return false;
  if (typeof value.dist.bridgePath !== "string") return false;
  if (typeof value.dist.mcpServerPath !== "string") return false;
  if (typeof value.dist.chromeExtensionDir !== "string") return false;
  if (!isBrowserOwnerMap(value.nativeManifestOwners)) return false;
  if (!isStringRecord(value.browsers)) return false;
  if (!Object.values(value.browsers).every((entry) => entry === undefined || isLegacyBrowserSetupState(entry))) return false;
  if (value.managedChromium !== undefined && !isManagedChromiumState(value.managedChromium)) return false;
  return true;
}

function isBrowserManifestMode(value: unknown): value is BrowserManifestMode {
  return value === "global" || value === "profile" || value === "both";
}

function inferLegacyManifestMode(browser: BrowserType): BrowserManifestMode {
  return browser === "firefox" ? "global" : "both";
}

function selectManagedProfilePath(
  legacyState: LegacySetupState,
  defaultManagedProfilePath: string,
): string {
  return legacyState.browsers.chromium?.profilePath
    || legacyState.browsers.chrome?.profilePath
    || defaultManagedProfilePath;
}

function migrateLegacySetupState(
  legacyState: LegacySetupState,
  options: LoadSetupStateOptions,
): SetupState {
  const migratedBrowsers = Object.fromEntries(
    Object.entries(legacyState.browsers).flatMap(([browser, value]) => {
      if (!value) return [];
      return [[browser, {
        ...value,
        manifestMode: inferLegacyManifestMode(value.browser),
      } satisfies BrowserSetupState]];
    }),
  ) as Partial<Record<BrowserType, BrowserSetupState>>;

  return {
    schemaVersion: SCHEMA_VERSION,
    installVersion: "repo-dev",
    installRoot: legacyState.repoRoot,
    activeWrapperPath: options.activeWrapperPath,
    managedProfilePath: selectManagedProfilePath(legacyState, options.defaultManagedProfilePath),
    updatedAt: legacyState.updatedAt,
    dist: {
      root: legacyState.dist.root,
      bridgePath: legacyState.dist.bridgePath,
      mcpServerPath: legacyState.dist.mcpServerPath,
      chromeExtensionDir: legacyState.dist.chromeExtensionDir,
    },
    nativeManifestOwners: legacyState.nativeManifestOwners,
    browsers: migratedBrowsers,
    managedChromium: legacyState.managedChromium,
    integration: {},
    migratedFromLegacy: true,
  };
}

function migratePreviousSetupState(previousState: PreviousSetupState): SetupState {
  return {
    ...previousState,
    schemaVersion: SCHEMA_VERSION,
    integration: previousState.integration ?? {},
  };
}

export function createEmptySetupState(shape: RepoStateShape): SetupState {
  return {
    schemaVersion: SCHEMA_VERSION,
    installVersion: shape.installVersion,
    installRoot: shape.installRoot,
    activeWrapperPath: shape.activeWrapperPath,
    managedProfilePath: shape.managedProfilePath,
    updatedAt: new Date().toISOString(),
    dist: {
      root: shape.distDir,
      bridgePath: shape.bridgePath,
      mcpServerPath: shape.mcpServerPath,
      chromeExtensionDir: shape.chromeExtensionDir,
    },
    nativeManifestOwners: {},
    browsers: {},
  };
}

export async function loadSetupState(
  stateFile: string,
  options?: LoadSetupStateOptions,
): Promise<SetupState | null> {
  try {
    const content = await readFile(stateFile, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (isSetupState(parsed)) {
      return parsed;
    }
    if (isPreviousSetupState(parsed)) {
      return migratePreviousSetupState(parsed);
    }
    if (options && isLegacySetupState(parsed)) {
      return migrateLegacySetupState(parsed, options);
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSetupState(stateFile: string, state: SetupState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");
}

export async function deleteSetupState(stateFile: string): Promise<void> {
  await rm(stateFile, { force: true });
}

export function hasPreparedBrowsers(state: SetupState): boolean {
  return Object.keys(state.browsers).length > 0;
}
