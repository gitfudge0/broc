import { describe, expect, it } from "vitest";
import { createShowcaseTask, createShowcaseTaskSummary, SHOWCASE_TASK_ID } from "../ui/showcase.js";

describe("showcase task", () => {
  it("exposes a pinned, non-deletable sidebar item", () => {
    const summary = createShowcaseTaskSummary();

    expect(summary.id).toBe(SHOWCASE_TASK_ID);
    expect(summary.pinned).toBe(true);
    expect(summary.deletable).toBe(false);
    expect(summary.title).toContain("Component Showcase");
  });

  it("models the simplified markdown-first notebook layout", () => {
    const task = createShowcaseTask();
    const sectionIds = task.view.sections.map((section) => section.id);

    expect(sectionIds).toEqual(["final-output", "supporting-notes"]);
    expect(task.view.sections[0].kind).toBe("markdown");
    expect(task.meta.artifacts).toHaveLength(2);
    expect(task.events.length).toBeGreaterThanOrEqual(5);
    expect(task.workflow.gatheredResults).toHaveLength(1);
    expect(task.workflow.finalOutput.summary).toContain("Showcase task completed");
    expect(task.workflow.finalOutput.screenshotArtifactId).toBe("showcase-image");
    expect(task.workflow.milestones[0].screenshotArtifactId).toBe("showcase-image");
    expect(task.workflow.gatheredResults[0].fields?.Song).toBe("Rockstar");
  });
});
