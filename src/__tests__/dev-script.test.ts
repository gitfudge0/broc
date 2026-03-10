import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DEV_BROWSER,
  DEV_BUILD_ARTIFACTS,
  DEV_RESTART_WATCH_PATHS,
  createDevController,
  parseDevArgs,
} from "../../scripts/dev.mjs";

class FakeProcess extends EventEmitter {
  pid;
  kill = vi.fn((signal?: NodeJS.Signals) => {
    queueMicrotask(() => {
      this.emit("exit", signal === "SIGTERM" ? 0 : 1, signal ?? null);
    });
    return true;
  });

  constructor(pid = 1234) {
    super();
    this.pid = pid;
  }
}

describe("parseDevArgs", () => {
  it("defaults to chrome", () => {
    expect(parseDevArgs([])).toEqual({ browser: DEFAULT_DEV_BROWSER });
  });

  it("accepts an explicit browser flag", () => {
    expect(parseDevArgs(["--browser=firefox"])).toEqual({ browser: "firefox" });
  });
});

describe("createDevController", () => {
  it("waits for build artifacts before launching", async () => {
    const build = new FakeProcess(1001);
    const launch = new FakeProcess(1002);
    const calls: string[] = [];

    const controller = createDevController(
      { browser: "chrome" },
      {
        spawnBuildWatch: () => {
          calls.push("build");
          return build;
        },
        spawnLaunch: () => {
          calls.push("launch");
          return launch;
        },
        waitForArtifacts: async (paths: string[]) => {
          expect(paths).toEqual(DEV_BUILD_ARTIFACTS);
          calls.push("artifacts");
        },
        watchArtifacts: vi.fn(() => () => {}),
        setTimer: vi.fn(),
        clearTimer: vi.fn(),
      },
    );

    await controller.start();
    expect(calls).toEqual(["build", "artifacts", "launch"]);
  });

  it("restarts the launch process when watched outputs change", async () => {
    const build = new FakeProcess(2001);
    const launches: FakeProcess[] = [];
    let changeHandler: (() => void) | null = null;
    let scheduledRestart: (() => Promise<void>) | null = null;

    const controller = createDevController(
      { browser: "chrome" },
      {
        spawnBuildWatch: () => build,
        spawnLaunch: () => {
          const child = new FakeProcess(3000 + launches.length);
          launches.push(child);
          return child;
        },
        waitForArtifacts: async () => {},
        watchArtifacts: (paths: string[], onChange: () => void) => {
          expect(paths).toEqual(DEV_RESTART_WATCH_PATHS);
          changeHandler = onChange;
          return () => {};
        },
        setTimer: (fn: () => void) => {
          scheduledRestart = async () => {
            fn();
            await new Promise((resolve) => setTimeout(resolve, 0));
            await new Promise((resolve) => setTimeout(resolve, 0));
          };
          return 1;
        },
        clearTimer: vi.fn(),
      },
    );

    await controller.start();
    expect(launches).toHaveLength(1);

    if (!changeHandler) {
      throw new Error("Expected dev controller to register a change handler.");
    }
    const triggerChange = changeHandler as () => void;

    triggerChange();
    if (!scheduledRestart) {
      throw new Error("Expected dev controller to schedule a restart after a change.");
    }
    const runScheduledRestart = scheduledRestart as () => Promise<void>;
    await runScheduledRestart();

    expect(launches).toHaveLength(2);
    expect(launches[0].kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("stops build and launch children on stop", async () => {
    const build = new FakeProcess(4001);
    const launch = new FakeProcess(4002);
    const cleanupWatchers = vi.fn();

    const controller = createDevController(
      { browser: "chrome" },
      {
        spawnBuildWatch: () => build,
        spawnLaunch: () => launch,
        waitForArtifacts: async () => {},
        watchArtifacts: () => cleanupWatchers,
        setTimer: vi.fn(),
        clearTimer: vi.fn(),
      },
    );

    await controller.start();
    await controller.stop("SIGTERM");

    expect(cleanupWatchers).toHaveBeenCalledOnce();
    expect(build.kill).toHaveBeenCalledWith("SIGTERM");
    expect(launch.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("fails when the launch child exits unexpectedly", async () => {
    const build = new FakeProcess(5001);
    const launch = new FakeProcess(5002);

    const controller = createDevController(
      { browser: "chrome" },
      {
        spawnBuildWatch: () => build,
        spawnLaunch: () => launch,
        waitForArtifacts: async () => {},
        watchArtifacts: () => () => {},
        setTimer: vi.fn(),
        clearTimer: vi.fn(),
      },
    );

    await controller.start();
    launch.emit("exit", 1, null);

    await expect(controller.finished).rejects.toThrow("Launch process exited with code 1");
  });
});
