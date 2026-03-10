import { attachTerminationHandlers, terminateProcesses, waitForBridgeOrBrowserExit, type ProcessLike } from "./launch.js";

export interface LaunchSessionOptions {
  startMcp: boolean;
}

export interface LaunchSessionDeps {
  spawnBrowser: () => ProcessLike;
  spawnMcpServer: () => ProcessLike;
  waitForChildSpawn: (child: ProcessLike, label: string) => Promise<void>;
  waitForBridge: () => Promise<void>;
  openLaunchUrl: () => Promise<void>;
  attachSignalHandlers?: (targets: ProcessLike[], onSignal: (signal: NodeJS.Signals) => void | Promise<void>) => () => void;
  terminateProcesses?: (targets: Array<ProcessLike | null | undefined>, options?: { signal?: NodeJS.Signals }) => Promise<void>;
}

export async function orchestrateLaunchSession(
  options: LaunchSessionOptions,
  deps: LaunchSessionDeps,
): Promise<void> {
  const browserProcess = deps.spawnBrowser();
  await deps.waitForChildSpawn(browserProcess, "browser");
  await waitForBridgeOrBrowserExit(browserProcess, deps.waitForBridge);
  await deps.openLaunchUrl();

  if (!options.startMcp) {
    browserProcess.unref?.();
    return;
  }

  const mcpProcess = deps.spawnMcpServer();
  await deps.waitForChildSpawn(mcpProcess, "MCP server");

  const shutdownChildren = async (targets: Array<ProcessLike | null | undefined>, signal: NodeJS.Signals = "SIGTERM") => {
    await (deps.terminateProcesses ?? terminateProcesses)(targets, { signal });
  };

  await new Promise<void>((resolve, reject) => {
    let shuttingDown = false;

    const settle = (callback: () => void) => {
      if (shuttingDown) {
        return false;
      }
      shuttingDown = true;
      callback();
      return true;
    };

    const cleanupSignalHandlers = (deps.attachSignalHandlers ?? attachTerminationHandlers)([
      mcpProcess,
      browserProcess,
    ], async (signal) => {
      if (!settle(cleanupSignalHandlers)) return;
      await shutdownChildren([mcpProcess, browserProcess], signal);
      resolve();
    });

    const onError = (error: Error) => {
      if (!settle(cleanupSignalHandlers)) return;
      void shutdownChildren([browserProcess], "SIGTERM").finally(() => {
        reject(error);
      });
    };

    const onExit = (code: number | null) => {
      if (!settle(cleanupSignalHandlers)) return;
      void shutdownChildren([browserProcess], "SIGTERM").finally(() => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`MCP server exited with code ${code}`));
        }
      });
    };

    mcpProcess.once("error", onError);
    mcpProcess.once("exit", onExit);
  });
}
