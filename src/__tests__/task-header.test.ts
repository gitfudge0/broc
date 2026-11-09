import { describe, expect, it } from "vitest";
import { taskHeader } from "../ui/components/task-header.js";

describe("taskHeader", () => {
  it("renders a delete button for deletable notebooks", () => {
    const html = taskHeader({
      taskId: "task_123",
      title: "Notebook polish",
      summary: "Fix layout and actions",
      status: "running",
      createdAt: "2026-03-15T10:00:00.000Z",
      updatedAt: "2026-03-15T10:10:00.000Z",
      deletable: true,
    });

    expect(html).toContain('data-delete-task-id="task_123"');
    expect(html).toContain("Delete");
  });

  it("omits the delete button for non-deletable notebooks", () => {
    const html = taskHeader({
      taskId: "task_showcase",
      title: "Component Showcase",
      status: "completed",
      createdAt: "2026-03-15T10:00:00.000Z",
      updatedAt: "2026-03-15T10:10:00.000Z",
      deletable: false,
    });

    expect(html).not.toContain('data-delete-task-id="task_showcase"');
  });
});
