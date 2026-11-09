import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import type { AppPaths } from "../cli/paths.js";
import {
  addNotebookHighlight,
  addNotebookGatheredResult,
  addNotebookSuggestedAction,
  createNotebookTask,
  listNotebookTasks,
  loadNotebookTask,
  setNotebookSummary,
  setNotebookView,
  upsertNotebookSection,
} from "../notebook/store.js";

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

  it("keeps canonical sections focused on the final output", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-store-"));
    const appPaths = createAppPaths(root);

    try {
      const task = await createNotebookTask(appPaths, {
        title: "Checkout flow",
        goal: "Buy one item after review",
        plan: [{ id: "step-1", label: "Inspect cart", status: "running" }],
      });

      const stored = await loadNotebookTask(appPaths, task.meta.id);

      expect(stored.workflow.milestones).toEqual([]);
      expect(stored.view.sections?.map((section) => section.id)).toEqual(["final-output"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not duplicate the task text into final summary by default", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-store-"));
    const appPaths = createAppPaths(root);

    try {
      const task = await createNotebookTask(appPaths, {
        title: "Find LISA songs",
        goal: "Use Broc to open YouTube and identify top songs from LISA, then summarize the best results for the user.",
      });

      const stored = await loadNotebookTask(appPaths, task.meta.id);
      const finalSection = stored.view.sections?.find((section) => section.id === "final-output");

      expect(stored.workflow.finalOutput?.summary).toBeUndefined();
      expect(String(finalSection?.content)).not.toContain("## Summary\nUse Broc to open YouTube and identify top songs from LISA, then summarize the best results for the user.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces gathered results in the final output section", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-store-"));
    const appPaths = createAppPaths(root);

    try {
      const task = await createNotebookTask(appPaths, {
        title: "Find LISA songs",
        goal: "Find top LISA songs",
      });

      await addNotebookGatheredResult(appPaths, task.meta.id, {
        label: "Track",
        value: "LALISA",
        fields: {
          Rank: "1",
          Song: "LALISA",
        },
        source: "YouTube results",
      });
      const stored = await loadNotebookTask(appPaths, task.meta.id);
      const finalSection = stored.view.sections?.find((section) => section.id === "final-output");

      expect(String(finalSection?.content)).toContain("LALISA");
      expect(stored.workflow.gatheredResults).toHaveLength(1);
      expect(stored.workflow.gatheredResults?.[0].fields?.Song).toBe("LALISA");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("synthesizes presentation highlights, actions, and inline custom sections", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-store-"));
    const appPaths = createAppPaths(root);

    try {
      const task = await createNotebookTask(appPaths, {
        title: "Notebook presentation",
        goal: "Bridge the notebook and UI layers",
      });

      await setNotebookSummary(appPaths, task.meta.id, "Synthesized summary");
      await addNotebookHighlight(appPaths, task.meta.id, {
        id: "hl-custom",
        label: "Mode",
        value: "Synthesis",
      });
      await addNotebookSuggestedAction(appPaths, task.meta.id, {
        id: "action-open",
        label: "Open docs",
        kind: "open_url",
        payload: { url: "https://example.com/docs" },
      });
      await upsertNotebookSection(appPaths, task.meta.id, {
        id: "history-notes",
        title: "History Notes",
        kind: "markdown",
        tab: "final-output",
        content: "## Notes\n\nKeep supporting notes inline with the main output.",
      });

      const stored = await loadNotebookTask(appPaths, task.meta.id);
      const historySection = stored.view.sections?.find((section) => section.id === "history-notes");

      expect(stored.view.summary).toBe("Synthesized summary");
      expect(stored.view.highlights?.some((item) => item.id === "hl-custom")).toBe(true);
      expect(stored.view.suggestedActions?.some((item) => item.id === "action-open")).toBe(true);
      expect(historySection?.tab).toBe("final-output");
      expect(historySection?.kind).toBe("markdown");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps raw notebook_set_view sections as fallback custom sections", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "broc-notebook-store-"));
    const appPaths = createAppPaths(root);

    try {
      const task = await createNotebookTask(appPaths, {
        title: "Legacy raw view",
        goal: "Support raw view fallback",
      });

      await setNotebookView(appPaths, task.meta.id, {
        merge: true,
        value: {
          sections: [{
            id: "legacy-section",
            title: "Legacy",
            kind: "list",
            tab: "final-output",
            content: ["old", "raw", "section"],
          }],
        },
      });

      const stored = await loadNotebookTask(appPaths, task.meta.id);
      const legacySection = stored.view.sections?.find((section) => section.id === "legacy-section");

      expect(legacySection).toBeTruthy();
      expect(legacySection?.tab).toBe("final-output");
      expect(stored.view.sections?.map((section) => section.id)).toEqual(["final-output", "legacy-section"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
