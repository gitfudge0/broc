import { access } from "fs/promises";
import { spawn, type ChildProcess, type SpawnOptions } from "child_process";
import type { RepoPaths } from "./paths.js";
import type { BrowserSetupState, ManagedChromiumState } from "./state.js";

export const DEFAULT_LAUNCH_URL = "https://www.google.com";

export interface LaunchPlan {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export interface ProcessLike {
  pid?: number;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "spawn", listener: () => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on?(event: "error", listener: (error: Error) => void): this;
  unref?(): void;
}

export interface TerminateProcessOptions {
  signal?: NodeJS.Signals;
  timeoutMs?: number;
  forceSignal?: NodeJS.Signals;
  forceTimeoutMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

export async function buildFirefoxLaunchPlan(
  repoPaths: RepoPaths,
  browserState: BrowserSetupState,
  url?: string,
): Promise<LaunchPlan> {
  await access(repoPaths.webExtBinaryPath);

  const args = [
    "run",
    "--source-dir",
    repoPaths.firefoxExtensionDir,
    "--config",
    repoPaths.webExtConfigPath,
    "--no-input",
    "--firefox",
    browserState.executablePath,
    "--firefox-profile",
    browserState.profilePath,
    "--profile-create-if-missing",
    "--keep-profile-changes",
    "--url",
    url || DEFAULT_LAUNCH_URL,
  ];

  return {
    command: repoPaths.webExtBinaryPath,
    args,
    cwd: repoPaths.repoRoot,
    env: { ...process.env },
  };
}

export function buildChromiumLaunchPlan(
  repoPaths: RepoPaths,
  browserState: BrowserSetupState,
  runtime: ManagedChromiumState,
  url?: string,
): LaunchPlan {
  const args = [
    `--user-data-dir=${browserState.profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--disable-extensions-except=${repoPaths.chromeExtensionDir}`,
    `--load-extension=${repoPaths.chromeExtensionDir}`,
    url || DEFAULT_LAUNCH_URL,
  ];

  return {
    command: runtime.executablePath,
    args,
    cwd: repoPaths.repoRoot,
    env: { ...process.env },
  };
}

export function spawnLaunchPlan(
  plan: LaunchPlan,
  options: SpawnOptions = {},
): ChildProcess {
  return spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    env: plan.env,
    stdio: "inherit",
    ...options,
  });
}

export async function waitForChildSpawn(child: ProcessLike, label: string): Promise<void> {
  if ("pid" in child && typeof child.pid === "number" && child.pid > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    child.once("spawn", () => {
      settled = true;
      resolve();
    });

    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to start ${label}: ${error.message}`));
      }
    });

    child.once("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`${label} exited before startup completed${code === null ? "" : ` (code ${code})`}`));
      }
    });
  });
}

export async function waitForBridgeReady(options: {
  timeoutMs?: number;
  intervalMs?: number;
  isBridgeRunning: () => boolean;
  pingBridge: () => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const intervalMs = options.intervalMs ?? 200;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (options.isBridgeRunning()) {
      const alive = await options.pingBridge().catch(() => false);
      if (alive) return;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Browser launched, but the extension bridge did not connect within ${timeoutMs}ms.`);
}

export async function waitForBridgeOrBrowserExit(
  browserProcess: ProcessLike,
  waitForBridge: () => Promise<void>,
): Promise<void> {
  await Promise.race([
    waitForBridge(),
    new Promise<never>((_, reject) => {
      browserProcess.once("exit", (code) => {
        reject(new Error(`Browser exited before the extension bridge connected${code === null ? "" : ` (code ${code})`}.`));
      });
    }),
  ]);
}

function hasExited(target: ProcessLike): boolean {
  return target.exitCode !== undefined && target.exitCode !== null
    || target.signalCode !== undefined && target.signalCode !== null;
}

function waitForProcessExit(target: ProcessLike): Promise<void> {
  if (hasExited(target)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    target.once("exit", () => resolve());
  });
}

async function waitForExitWithTimeout(
  target: ProcessLike,
  exitPromise: Promise<void>,
  timeoutMs: number,
  setTimer: typeof setTimeout,
  clearTimer: typeof clearTimeout,
): Promise<boolean> {
  if (hasExited(target)) {
    return true;
  }

  const observedExit = exitPromise.then(() => true);

  const timeoutPromise = new Promise<boolean>((resolve) => {
    const timer = setTimer(() => {
      clearTimer(timer);
      resolve(false);
    }, timeoutMs);

    void observedExit.finally(() => {
      clearTimer(timer);
    });
  });

  return Promise.race([observedExit, timeoutPromise]);
}

export async function terminateProcess(
  target: ProcessLike | null | undefined,
  options: TerminateProcessOptions = {},
): Promise<void> {
  if (!target || hasExited(target)) {
    return;
  }

  const signal = options.signal ?? "SIGTERM";
  const timeoutMs = options.timeoutMs ?? 5000;
  const forceSignal = options.forceSignal ?? "SIGKILL";
  const forceTimeoutMs = options.forceTimeoutMs ?? 1000;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const exitPromise = waitForProcessExit(target);

  try {
    target.kill(signal);
  } catch {
    return;
  }

  if (await waitForExitWithTimeout(target, exitPromise, timeoutMs, setTimer, clearTimer)) {
    return;
  }

  try {
    target.kill(forceSignal);
  } catch {
    return;
  }

  await waitForExitWithTimeout(target, exitPromise, forceTimeoutMs, setTimer, clearTimer);
}

export async function terminateProcesses(
  targets: Array<ProcessLike | null | undefined>,
  options: TerminateProcessOptions = {},
): Promise<void> {
  await Promise.all(targets.map((target) => terminateProcess(target, options)));
}

type TerminationSignalHandler = (signal: NodeJS.Signals) => void | Promise<void>;
type RegisterSignalHandler = (signal: NodeJS.Signals, handler: () => void) => void;

export function attachTerminationHandlers(
  targets: ProcessLike[],
  onSignalOrRegisterHandler?: TerminationSignalHandler | RegisterSignalHandler,
  registerHandlerArg?: RegisterSignalHandler,
): () => void {
  const onSignal = registerHandlerArg || (onSignalOrRegisterHandler && onSignalOrRegisterHandler.length >= 2)
    ? ((signal: NodeJS.Signals) => {
        for (const target of targets) {
          try {
            target.kill(signal);
          } catch {
            // Ignore already-exited children.
          }
        }
      })
    : ((onSignalOrRegisterHandler as TerminationSignalHandler | undefined) ?? ((signal: NodeJS.Signals) => {
        for (const target of targets) {
          try {
            target.kill(signal);
          } catch {
            // Ignore already-exited children.
          }
        }
      }));

  const registerHandler = registerHandlerArg
    ?? (onSignalOrRegisterHandler && onSignalOrRegisterHandler.length >= 2
      ? onSignalOrRegisterHandler as RegisterSignalHandler
      : (signal: NodeJS.Signals, handler: () => void) => {
    process.on(signal, handler);
      });

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const handlers = signals.map((signal) => {
    const handler = () => {
      void onSignal(signal);
    };
    registerHandler(signal, handler);
    return { signal, handler };
  });

  return () => {
    for (const { signal, handler } of handlers) {
      process.off(signal, handler);
    }
  };
}

export async function runLaunchPlan(plan: LaunchPlan): Promise<void> {
  const child = spawnLaunchPlan(plan);
  await waitForChildSpawn(child, "browser");
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Browser process exited with code ${code}`));
      }
    });
  });
}
