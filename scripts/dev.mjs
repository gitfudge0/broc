import { existsSync, watchFile, unwatchFile } from "fs";
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

export const DEFAULT_DEV_BROWSER = "chrome";
export const VALID_DEV_BROWSERS = ["firefox", "chrome", "chromium"];
export const DEV_BUILD_ARTIFACTS = [
  resolve(repoRoot, "dist", "cli.mjs"),
  resolve(repoRoot, "dist", "mcp-server.mjs"),
  resolve(repoRoot, "dist", "firefox", "manifest.json"),
  resolve(repoRoot, "dist", "chrome", "manifest.json"),
];
export const DEV_RESTART_WATCH_PATHS = [
  resolve(repoRoot, "dist", "cli.mjs"),
  resolve(repoRoot, "dist", "mcp-server.mjs"),
  resolve(repoRoot, "dist", "firefox", "background.js"),
  resolve(repoRoot, "dist", "firefox", "content.js"),
  resolve(repoRoot, "dist", "firefox", "manifest.json"),
  resolve(repoRoot, "dist", "chrome", "background.js"),
  resolve(repoRoot, "dist", "chrome", "content.js"),
  resolve(repoRoot, "dist", "chrome", "manifest.json"),
];

export function parseDevArgs(argv) {
  const browserArg = argv.find((arg) => arg.startsWith("--browser="));
  const browser = browserArg ? browserArg.slice("--browser=".length) : DEFAULT_DEV_BROWSER;

  if (!VALID_DEV_BROWSERS.includes(browser)) {
    throw new Error(`Invalid browser: ${browser}. Must be one of: ${VALID_DEV_BROWSERS.join(", ")}`);
  }

  return { browser };
}

export async function waitForArtifacts(
  paths,
  {
    exists = existsSync,
    sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
    timeoutMs = 30000,
    intervalMs = 100,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (paths.every((path) => exists(path))) {
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error("Timed out waiting for initial build artifacts.");
}

export function createArtifactWatcher(
  paths,
  onChange,
  {
    watchFileImpl = watchFile,
    unwatchFileImpl = unwatchFile,
    intervalMs = 250,
  } = {},
) {
  const listeners = new Map();

  for (const path of paths) {
    const listener = (current, previous) => {
      if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
        onChange(path);
      }
    };
    listeners.set(path, listener);
    watchFileImpl(path, { interval: intervalMs }, listener);
  }

  return () => {
    for (const [path, listener] of listeners) {
      unwatchFileImpl(path, listener);
    }
  };
}

export function createDevController(
  options,
  deps,
) {
  let buildChild = null;
  let launchChild = null;
  let stopRequested = false;
  let restartTimer = null;
  let restartInFlight = false;
  let pendingRestart = false;
  let cleanupWatchers = () => {};
  let finishResolve;
  let finishReject;
  const finished = new Promise((resolvePromise, rejectPromise) => {
    finishResolve = resolvePromise;
    finishReject = rejectPromise;
  });

  const clearRestartTimer = () => {
    if (restartTimer) {
      deps.clearTimer(restartTimer);
      restartTimer = null;
    }
  };

  const stopChild = (child, signal = "SIGTERM") => {
    if (!child) return;
    try {
      child.kill(signal);
    } catch {
      // Ignore already-exited child processes.
    }
  };

  const waitForExit = (child) => new Promise((resolvePromise) => {
    child.once("exit", () => resolvePromise());
  });

  const attachLaunchHandlers = (child) => {
    child.once("error", (error) => {
      if (stopRequested) return;
      finishReject(error);
    });
    child.once("exit", (code) => {
      launchChild = null;
      if (stopRequested || restartInFlight) return;
      if (code === 0 || code === null) {
        finishResolve();
      } else {
        finishReject(new Error(`Launch process exited with code ${code}`));
      }
    });
  };

  const startLaunch = () => {
    launchChild = deps.spawnLaunch(options.browser);
    attachLaunchHandlers(launchChild);
  };

  const restartLaunch = async () => {
    if (stopRequested) return;
    if (restartInFlight) {
      pendingRestart = true;
      return;
    }

    restartInFlight = true;
    clearRestartTimer();

    if (launchChild) {
      const exitingChild = launchChild;
      stopChild(exitingChild, "SIGTERM");
      await waitForExit(exitingChild);
    }

    if (!stopRequested) {
      await deps.waitForArtifacts(DEV_BUILD_ARTIFACTS);
      startLaunch();
    }

    restartInFlight = false;
    if (pendingRestart) {
      pendingRestart = false;
      await restartLaunch();
    }
  };

  const scheduleRestart = () => {
    if (stopRequested) return;
    clearRestartTimer();
    restartTimer = deps.setTimer(() => {
      restartTimer = null;
      restartLaunch().catch((error) => {
        finishReject(error);
      });
    }, 300);
  };

  const stop = async (signal = "SIGTERM") => {
    if (stopRequested) return;
    stopRequested = true;
    clearRestartTimer();
    cleanupWatchers();
    stopChild(launchChild, signal);
    stopChild(buildChild, signal);
    finishResolve();
  };

  const start = async () => {
    buildChild = deps.spawnBuildWatch();
    buildChild.once("error", (error) => {
      if (stopRequested) return;
      finishReject(error);
    });
    buildChild.once("exit", (code) => {
      if (stopRequested) return;
      if (code === 0 || code === null) {
        finishResolve();
      } else {
        finishReject(new Error(`Build watcher exited with code ${code}`));
      }
    });

    await deps.waitForArtifacts(DEV_BUILD_ARTIFACTS);
    cleanupWatchers = deps.watchArtifacts(DEV_RESTART_WATCH_PATHS, scheduleRestart);
    startLaunch();
  };

  return {
    start,
    stop,
    scheduleRestart,
    finished,
  };
}

export async function runDev(argv, dependencyOverrides = {}) {
  const options = parseDevArgs(argv);
  const deps = {
    spawnBuildWatch: () => spawn("node", ["build.mjs", "--watch"], {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env },
    }),
    spawnLaunch: (browser) => spawn("node", ["scripts/repo-cli.mjs", "launch", `--browser=${browser}`], {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env },
    }),
    waitForArtifacts: (paths) => waitForArtifacts(paths),
    watchArtifacts: (paths, onChange) => createArtifactWatcher(paths, onChange),
    setTimer: (fn, delay) => setTimeout(fn, delay),
    clearTimer: (timer) => clearTimeout(timer),
    ...dependencyOverrides,
  };

  const controller = createDevController(options, deps);
  const signalHandlers = ["SIGINT", "SIGTERM"].map((signal) => {
    const handler = () => {
      controller.stop(signal).catch(() => {});
    };
    process.on(signal, handler);
    return { signal, handler };
  });

  try {
    await controller.start();
    await controller.finished;
  } finally {
    for (const { signal, handler } of signalHandlers) {
      process.off(signal, handler);
    }
  }
}

if (process.argv[1] === __filename) {
  runDev(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
