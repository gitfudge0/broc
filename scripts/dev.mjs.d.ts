export const DEFAULT_DEV_BROWSER: string;
export const VALID_DEV_BROWSERS: string[];
export const DEV_BUILD_ARTIFACTS: string[];
export const DEV_RESTART_WATCH_PATHS: string[];

export function parseDevArgs(argv: string[]): {
  browser: string;
};

export function waitForArtifacts(
  paths: string[],
  options?: {
    exists?: (path: string) => boolean;
    sleep?: (ms: number) => Promise<void>;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<void>;

export function createArtifactWatcher(
  paths: string[],
  onChange: (path: string) => void,
  options?: {
    watchFileImpl?: typeof import("fs").watchFile;
    unwatchFileImpl?: typeof import("fs").unwatchFile;
    intervalMs?: number;
  },
): () => void;

export function createDevController(
  options: { browser: string },
  deps: Record<string, unknown>,
): {
  start(): Promise<void>;
  stop(signal?: NodeJS.Signals): Promise<void>;
  scheduleRestart(): void;
  finished: Promise<void>;
};

export function runDev(argv: string[], dependencyOverrides?: Record<string, unknown>): Promise<void>;
