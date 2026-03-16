import { escapeHtml, formatDate, padOrdinal } from "../utils";
import { statusBadge } from "./status-badge";

export interface TaskListItemData {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  createdAt: string;
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
    <article class="task-item${active}" data-task-item="${escapeHtml(task.id)}">
      <div class="task-item__row">
        <span class="task-item__ordinal">${padOrdinal(index + 1)}</span>
        <span class="task-item__divider"></span>
        <div class="task-item__body">
          <button class="task-item__select" data-task-id="${escapeHtml(task.id)}" type="button" aria-current="${isActive ? "true" : "false"}">
            <div class="task-item__header">
              <span class="task-item__title">${escapeHtml(task.title)}</span>
              ${statusBadge({ status: task.status })}
            </div>
            <p class="task-item__summary">${escapeHtml(task.summary || "No summary yet")}</p>
            <span class="task-item__date">${escapeHtml(formatDate(task.createdAt))}</span>
          </button>
        </div>
        <button class="task-item__delete" data-delete-task-id="${escapeHtml(task.id)}" type="button" title="Delete task" aria-label="Delete task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          <span class="visually-hidden">Delete ${escapeHtml(task.title)}</span>
        </button>
      </div>
    </article>
  `;
}

export const taskListItemCSS = /* css */ `
.task-item {
  width: 100%;
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  transition: background 0.15s, box-shadow 0.15s;
}
.task-item:hover {
  background: var(--surface-hover);
}
.task-item--active {
  background: var(--surface);
  box-shadow: var(--shadow-card);
}
.task-item__row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: var(--sp-3);
}
.task-item__ordinal {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  padding-top: 10px;
}
.task-item--active .task-item__ordinal {
  color: var(--accent);
}
.task-item__divider {
  width: 16px;
  height: 1px;
  background: var(--border-strong);
  margin-top: 18px;
}
.task-item--active .task-item__divider {
  background: var(--accent);
}
.task-item__body {
  min-width: 0;
}
.task-item__select {
  display: block;
  width: 100%;
  text-align: left;
  border-radius: calc(var(--radius-md) - 4px);
  padding: var(--sp-1) 0;
  outline-offset: 2px;
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
  max-width: 160px;
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
  display: inline-block;
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--text-muted);
  margin-top: var(--sp-1);
}
.task-item__delete {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: var(--surface-muted);
  border: 1px solid var(--border);
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  margin-top: 6px;
}
.task-item__select:focus-visible,
.task-item__delete:focus-visible {
  outline: 2px solid var(--accent);
}
.task-item__delete:hover {
  color: var(--danger, #c0392b);
  background: var(--surface-hover);
  border-color: var(--border-strong);
}

@media (max-width: 900px) {
  .task-item {
    flex-shrink: 0;
    min-width: 220px;
    max-width: 260px;
  }
  .task-item__row {
    grid-template-columns: auto auto minmax(0, 1fr);
  }
  .task-item__delete {
    grid-column: 3;
    justify-self: end;
    margin-top: 0;
  }
  .task-item__title {
    max-width: none;
  }
}
`;
