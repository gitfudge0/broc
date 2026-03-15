import { escapeHtml, formatDate, padOrdinal } from "../utils";
import { statusBadge } from "./status-badge";

export interface TaskListItemData {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  summary?: string;
}

export interface TaskListItemProps {
  task: TaskListItemData;
  index: number;
  isActive: boolean;
}

export function taskListItem({ task, index, isActive }: TaskListItemProps): string {
  const active = isActive ? " task-item--active" : "";
  return `
    <button class="task-item${active}" data-task-id="${escapeHtml(task.id)}">
      <div class="task-item__row">
        <span class="task-item__ordinal">${padOrdinal(index + 1)}</span>
        <span class="task-item__divider"></span>
        <div class="task-item__body">
          <div class="task-item__header">
            <span class="task-item__title">${escapeHtml(task.title)}</span>
            ${statusBadge({ status: task.status })}
          </div>
          <p class="task-item__summary">${escapeHtml(task.summary || "No summary yet")}</p>
          <span class="task-item__date">${escapeHtml(formatDate(task.updatedAt))}</span>
        </div>
      </div>
    </button>
  `;
}

export const taskListItemCSS = /* css */ `
.task-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--sp-4);
  border-radius: var(--radius-md);
  transition: background 0.15s;
  cursor: pointer;
}
.task-item:hover {
  background: var(--surface-hover);
}
.task-item--active {
  background: var(--surface);
  box-shadow: var(--shadow-card);
}
.task-item__row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
}
.task-item__ordinal {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  flex-shrink: 0;
  padding-top: 2px;
}
.task-item--active .task-item__ordinal {
  color: var(--accent);
}
.task-item__divider {
  width: 16px;
  height: 1px;
  background: var(--border-strong);
  flex-shrink: 0;
  margin-top: 10px;
}
.task-item--active .task-item__divider {
  background: var(--accent);
}
.task-item__body {
  min-width: 0;
  flex: 1;
}
.task-item__header {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.task-item__title {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}
.task-item__summary {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: var(--sp-1);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.task-item__date {
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--text-muted);
  margin-top: var(--sp-1);
}

@media (max-width: 900px) {
  .task-item {
    flex-shrink: 0;
    min-width: 200px;
    max-width: 240px;
  }
  .task-item__title {
    max-width: none;
  }
}
`;
