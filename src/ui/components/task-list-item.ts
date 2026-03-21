import { escapeHtml, formatDate, padOrdinal } from "../utils";
import { statusBadge } from "./status-badge";

export interface TaskListItemData {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  summary?: string;
  pinned?: boolean;
  deletable?: boolean;
}

export interface TaskListItemProps {
  task: TaskListItemData;
  index: number;
  isActive: boolean;
}

export function taskListItem({ task, index, isActive }: TaskListItemProps): string {
  const active = isActive ? " task-item--active" : "";
  const pinned = task.pinned ? " task-item--pinned" : "";
  const showDelete = task.deletable !== false;
  return `
    <article class="task-item${active}${pinned}" data-task-item="${escapeHtml(task.id)}">
      <button class="task-item__select" data-task-id="${escapeHtml(task.id)}" type="button" aria-current="${isActive ? "true" : "false"}">
        <div class="task-item__header">
          <span class="task-item__title">${escapeHtml(task.title)}</span>
          <div class="task-item__badges">
            ${task.pinned ? `<span class="task-item__pin">Showcase</span>` : ""}
            ${statusBadge({ status: task.status })}
          </div>
        </div>
        <p class="task-item__summary">${escapeHtml(task.summary || "No summary yet")}</p>
        <span class="task-item__date">${escapeHtml(formatDate(task.createdAt))}</span>
      </button>
      ${showDelete ? `<button class="task-item__delete" data-delete-task-id="${escapeHtml(task.id)}" type="button" title="Delete task" aria-label="Delete task">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        <span class="visually-hidden">Delete ${escapeHtml(task.title)}</span>
      </button>` : ""}
    </article>
  `;
}

export const taskListItemCSS = /* css */ `
.task-item {
  width: 100%;
  padding: var(--sp-3) var(--sp-3);
  border-radius: var(--radius-md);
  transition: background 0.12s;
  position: relative;
  border-bottom: 1px solid var(--border);
}
.task-item:last-child {
  border-bottom: none;
}
.task-item:hover {
  background: var(--surface-hover);
}
.task-item--active {
  background: var(--surface-hover);
}
.task-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--sp-3);
  bottom: var(--sp-3);
  width: 3px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.task-item--pinned {
  background: var(--accent-soft);
}
.task-item__select {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--sp-1) 0;
  outline-offset: 2px;
}
.task-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.task-item__badges {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-shrink: 0;
}
.task-item__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.task-item__pin {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  opacity: 0.7;
}
.task-item__summary {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.task-item__date {
  display: inline-block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.task-item__delete {
  position: absolute;
  top: var(--sp-3);
  right: var(--sp-3);
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  opacity: 0;
  transition: opacity 0.12s, color 0.12s, background 0.12s;
}
.task-item:hover .task-item__delete {
  opacity: 1;
}
.task-item__select:focus-visible,
.task-item__delete:focus-visible {
  outline: 2px solid var(--accent);
}
.task-item__delete:hover {
  color: var(--accent);
  background: var(--accent-soft);
}

@media (max-width: 900px) {
  .task-item {
    flex-shrink: 0;
    min-width: 200px;
    max-width: 240px;
    border-bottom: none;
    border-right: 1px solid var(--border);
  }
  .task-item:last-child {
    border-right: none;
  }
  .task-item__title {
    max-width: none;
  }
  .task-item__delete {
    opacity: 1;
  }
}
`;
