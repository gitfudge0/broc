import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname } from "path";
import type { BrowserType } from "./types.js";

const SCHEMA_VERSION = 1;

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
}

export interface SetupState {
  schemaVersion: number;
  repoRoot: string;
  updatedAt: string;
  dist: {
    root: string;
    bridgePath: string;
    mcpServerPath: string;
    firefoxExtensionDir: string;
    chromeExtensionDir: string;
  };
  nativeManifestOwners: Partial<Record<BrowserType, BrowserType[]>>;
  browsers: Partial<Record<BrowserType, BrowserSetupState>>;
  managedChromium?: ManagedChromiumState;
}

export interface RepoStateShape {
  repoRoot: string;
  distDir: string;
  bridgePath: string;
  mcpServerPath: string;
  firefoxExtensionDir: string;
  chromeExtensionDir: string;
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

export function isSetupState(value: unknown): value is SetupState {
  if (!isStringRecord(value)) return false;
  if (value.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof value.repoRoot !== "string" || typeof value.updatedAt !== "string") return false;
  if (!isStringRecord(value.dist)) return false;
  if (!isBrowserOwnerMap(value.nativeManifestOwners)) return false;
  if (!isStringRecord(value.browsers)) return false;
  if (!Object.values(value.browsers).every((entry) => entry === undefined || isBrowserSetupState(entry))) return false;
  if (value.managedChromium !== undefined && !isManagedChromiumState(value.managedChromium)) return false;
  return true;
}

export function createEmptySetupState(shape: RepoStateShape): SetupState {
  return {
    schemaVersion: SCHEMA_VERSION,
    repoRoot: shape.repoRoot,
    updatedAt: new Date().toISOString(),
    dist: {
      root: shape.distDir,
      bridgePath: shape.bridgePath,
      mcpServerPath: shape.mcpServerPath,
      firefoxExtensionDir: shape.firefoxExtensionDir,
      chromeExtensionDir: shape.chromeExtensionDir,
    },
    nativeManifestOwners: {},
    browsers: {},
  };
}

export async function loadSetupState(stateFile: string): Promise<SetupState | null> {
  try {
    const content = await readFile(stateFile, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    return isSetupState(parsed) ? parsed : null;
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
