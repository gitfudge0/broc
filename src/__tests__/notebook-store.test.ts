import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import type { AppPaths } from "../cli/paths.js";
import { createNotebookTask, listNotebookTasks, loadNotebookTask } from "../notebook/store.js";

function createAppPaths(root: string): AppPaths {
  return {
    configDir: resolve(root, "config"),
    cacheDir: resolve(root, "cache"),
    dataDir: resolve(root, "data"),
    profilesDir: resolve(root, "profiles"),
    runtimesDir: resolve(root, "runtimes"),
    installsDir: resolve(root, "installs"),
    binDir: resolve(root, "bin"),
    wrapperPath: resolve(root, "bin", "broc"),
    activeInstallFile: resolve(root, "active-install.json"),
    stateFile: resolve(root, "setup-state.json"),
  };
}

describe("notebook store", () => {
  it("upserts an existing notebook item instead of creating a duplicate", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-store-"));
    const appPaths = createAppPaths(root);

    try {
      const created = await createNotebookTask(appPaths, {
        id: "task-alpha",
        title: "Task Alpha",
        goal: "First goal",
        sessionId: "session-1",
        tabId: 7,
      });

      const updated = await createNotebookTask(appPaths, {
        id: "task-alpha",
        title: "Task Alpha Updated",
        sessionId: "session-2",
        tabId: 8,
      });

      const tasks = await listNotebookTasks(appPaths);
      const stored = await loadNotebookTask(appPaths, "task-alpha", { includeEvents: true });
      const eventsRaw = await readFile(resolve(appPaths.dataDir, "notebooks", "tasks", "task-alpha", "events.ndjson"), "utf-8");

      expect(created.meta.id).toBe("task-alpha");
      expect(updated.meta.id).toBe("task-alpha");
      expect(tasks).toHaveLength(1);
      expect(stored.meta.title).toBe("Task Alpha Updated");
      expect(stored.meta.sessionId).toBe("session-2");
      expect(stored.meta.tabId).toBe(8);
      expect(stored.view.summary).toBe("First goal");
      expect(eventsRaw.trim().split("\n")).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("derives a stable task id from the title when no id is provided", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-store-"));
    const appPaths = createAppPaths(root);

    try {
      const first = await createNotebookTask(appPaths, {
        title: "Fix Notebook Layout",
      });
      const second = await createNotebookTask(appPaths, {
        title: "Fix Notebook Layout",
      });

      const tasks = await listNotebookTasks(appPaths);

      expect(first.meta.id).toBe("fix-notebook-layout");
      expect(second.meta.id).toBe("fix-notebook-layout");
      expect(tasks).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("deletes legacy canvas data on store initialization", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-store-"));
    const appPaths = createAppPaths(root);
    const legacyEventPath = resolve(appPaths.dataDir, "canvases", "tasks", "legacy-task", "events.ndjson");

    try {
      await rm(resolve(appPaths.dataDir, "canvases"), { recursive: true, force: true }).catch(() => {});
      await createNotebookTask(appPaths, { title: "Bootstrap Notebook" });

      // Recreate disposable legacy test data and verify the next notebook access removes it.
      await rm(resolve(appPaths.dataDir, "notebooks"), { recursive: true, force: true });
      await mkdir(resolve(appPaths.dataDir, "canvases", "tasks", "legacy-task"), { recursive: true });
      await writeFile(legacyEventPath, "");

      await createNotebookTask(appPaths, { title: "Fresh Notebook" });

      await expect(readFile(legacyEventPath, "utf-8")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
