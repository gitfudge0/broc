import { taskListItem, TaskListItemData } from "./task-list-item";
import { emptyState } from "./empty-state";
import { themeToggle } from "./theme-toggle";

export interface SidebarProps {
  tasks: TaskListItemData[];
  selectedTaskId: string | null;
}

const collapseIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
const expandIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

export function sidebar({ tasks, selectedTaskId }: SidebarProps): string {
  const brand = `
    <div class="sidebar-brand sidebar-expanded-only">
      <div class="sidebar-brand__row">
        <div>
          <h1 class="sidebar-brand__title">Notebook</h1>
          <p class="sidebar-brand__subtitle">Task workspaces</p>
        </div>
        <div class="sidebar-brand__actions">
          ${themeToggle()}
          <button class="sidebar-collapse-btn" id="sidebar-collapse-btn" title="Collapse sidebar" aria-label="Collapse sidebar">
            ${collapseIcon}
          </button>
        </div>
      </div>
    </div>
  `;

  const expandButton = `
    <div class="sidebar-expand-area">
      <button class="sidebar-expand-btn" id="sidebar-expand-btn" title="Expand sidebar" aria-label="Expand sidebar">
        ${expandIcon}
      </button>
    </div>
  `;

  if (tasks.length === 0) {
    return `
      ${brand}
      <div class="sidebar-expanded-only">
        ${emptyState({ message: "No notebooks yet", hint: "Agents create them with notebook_create." })}
      </div>
      ${expandButton}
    `;
  }

  const items = tasks.map((task, index) =>
    taskListItem({ task, index, isActive: task.id === selectedTaskId })
  ).join("");

  return `
    ${brand}
    <div class="sidebar-list sidebar-expanded-only">${items}</div>
    ${expandButton}
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
.sidebar-brand__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.sidebar-collapse-btn,
.sidebar-expand-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.sidebar-collapse-btn:hover,
.sidebar-expand-btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}
.sidebar-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

/* Expand button -- hidden when sidebar is expanded */
.sidebar-expand-area {
  display: none;
}

/* -- Collapsed state (toggled via .shell--collapsed on .shell) -- */
.shell--collapsed {
  grid-template-columns: 76px minmax(0, 1fr);
}
.shell--collapsed .shell__sidebar {
  padding: var(--sp-3);
  overflow: hidden;
}
.shell--collapsed .sidebar-expanded-only {
  display: none !important;
}
.shell--collapsed .sidebar-expand-area {
  display: flex;
  justify-content: center;
  padding-top: var(--sp-2);
}

@media (max-width: 900px) {
  .sidebar-collapse-btn,
  .sidebar-expand-area {
    display: none !important;
  }
}
`;
