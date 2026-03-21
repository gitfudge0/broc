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

  it("includes examples for every supported section kind", () => {
    const task = createShowcaseTask();
    const kinds = task.view.sections.map((section) => section.kind);

    expect(kinds).toEqual([
      "text",
      "markdown",
      "key_value",
      "list",
      "checklist",
      "metrics",
      "links",
      "table",
      "code",
      "json",
      "diff",
      "media",
      "html",
      "timeline",
      "artifact_gallery",
    ]);
    expect(task.meta.artifacts).toHaveLength(2);
    expect(task.events.length).toBeGreaterThanOrEqual(5);
  });
});
