import { taskListItem, TaskListItemData } from "./task-list-item";
import { emptyState } from "./empty-state";
import { themeToggle } from "./theme-toggle";

export interface SidebarProps {
  tasks: TaskListItemData[];
  selectedTaskId: string | null;
}

export function sidebar({ tasks, selectedTaskId }: SidebarProps): string {
  const brand = `
    <div class="sidebar-brand">
      <div class="sidebar-brand__row">
        <div>
          <h1 class="sidebar-brand__title">Canvas</h1>
          <p class="sidebar-brand__subtitle">Task workspaces</p>
        </div>
        ${themeToggle()}
      </div>
    </div>
  `;

  if (tasks.length === 0) {
    return `
      ${brand}
      ${emptyState({ message: "No canvases yet", hint: "Agents create them with canvas_create." })}
    `;
  }

  const items = tasks.map((task, index) =>
    taskListItem({ task, index, isActive: task.id === selectedTaskId })
  ).join("");

  return `
    ${brand}
    <div class="sidebar-list">${items}</div>
  `;
}

export const sidebarCSS = /* css */ `
.sidebar-brand {
  padding-bottom: var(--sp-4);
  border-bottom: 1px solid var(--border);
}
.sidebar-brand__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.sidebar-brand__title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.sidebar-brand__subtitle {
  font-family: var(--font-display);
  font-size: 12px;
  color: var(--text-muted);
  margin-top: var(--sp-1);
}
.sidebar-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
`;
