import { describe, expect, it } from "vitest";
import { taskListItem } from "../ui/components/task-list-item";

describe("taskListItem", () => {
  it("renders separate select and delete buttons without nesting button elements", () => {
    const html = taskListItem({
      task: {
        id: "task_123",
        title: "Notebook polish",
        status: "running",
        createdAt: "2026-03-15T10:00:00.000Z",
        updatedAt: "2026-03-15T10:10:00.000Z",
        summary: "Fix layout and actions",
      },
      index: 0,
      isActive: true,
    });

    expect(html).toContain('<article class="task-item task-item--active"');
    expect(html).toContain('data-task-id="task_123"');
    expect(html).toContain('data-delete-task-id="task_123"');
    expect(html).not.toContain("<button class=\"task-item task-item--active\"");
  });
});
