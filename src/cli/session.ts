import { attachTerminationHandlers, waitForBridgeOrBrowserExit, type ProcessLike } from "./launch.js";

export interface LaunchSessionOptions {
  startMcp: boolean;
}

export interface LaunchSessionDeps {
  spawnBrowser: () => ProcessLike;
  spawnMcpServer: () => ProcessLike;
  waitForChildSpawn: (child: ProcessLike, label: string) => Promise<void>;
  waitForBridge: () => Promise<void>;
  openLaunchUrl: () => Promise<void>;
  stopProcess: (child: ProcessLike, signal?: NodeJS.Signals) => void;
  attachSignalHandlers?: (targets: ProcessLike[]) => () => void;
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

  const cleanupSignalHandlers = (deps.attachSignalHandlers ?? attachTerminationHandlers)([
    mcpProcess,
    browserProcess,
  ]);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanupSignalHandlers();
      deps.stopProcess(browserProcess, "SIGTERM");
      reject(error);
    };

    const onExit = (code: number | null) => {
      cleanupSignalHandlers();
      deps.stopProcess(browserProcess, "SIGTERM");
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`MCP server exited with code ${code}`));
      }
    };

    mcpProcess.once("error", onError);
    mcpProcess.once("exit", onExit);
  });
}
