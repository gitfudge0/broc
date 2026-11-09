import { escapeHtml, formatDate, formatDateTime } from "../utils";
import { statusBadge } from "./status-badge";
import { tagList } from "./tag-pill";

export interface TaskHeaderProps {
  taskId?: string;
  title: string;
  summary?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  deletable?: boolean;
}

export function taskHeader({ taskId, title, summary, status, createdAt, updatedAt, tags, deletable }: TaskHeaderProps): string {
  return `
    <header class="task-header">
      <div class="task-header__top">
        <div class="task-header__meta-row">
          <span class="task-header__meta-value">${escapeHtml(formatDateTime(createdAt))}</span>
          <span class="task-header__meta-sep">&middot;</span>
          <span class="task-header__meta-value">${escapeHtml(formatDate(updatedAt))}</span>
        </div>
        <div class="task-header__actions">
          ${statusBadge({ status })}
          ${deletable !== false && taskId ? `
            <button
              class="task-header__delete"
              data-delete-task-id="${escapeHtml(taskId)}"
              data-delete-task-title="${escapeHtml(title)}"
              type="button"
              title="Delete notebook"
              aria-label="Delete notebook ${escapeHtml(title)}"
            >
              Delete
            </button>
          ` : ""}
        </div>
      </div>

      <h1 class="task-header__title">${escapeHtml(title)}</h1>

      ${summary ? `<p class="task-header__summary">${escapeHtml(summary)}</p>` : ""}

      ${tags && tags.length > 0 ? `<div class="task-header__tags">${tagList(tags)}</div>` : ""}
    </header>
  `;
}

export const taskHeaderCSS = /* css */ `
.task-header {
  padding-bottom: var(--sp-7);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--sp-7);
}

.task-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-5);
}

.task-header__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.task-header__meta-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.task-header__meta-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.task-header__meta-sep {
  color: var(--text-muted);
  font-size: 12px;
}

.task-header__title {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 900;
  letter-spacing: -0.035em;
  line-height: 1.05;
  max-width: 16ch;
  margin-bottom: var(--sp-4);
  color: var(--text-primary);
}

.task-header__summary {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-secondary);
  max-width: 55ch;
}

.task-header__tags {
  margin-top: var(--sp-4);
}

.task-header__delete {
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--surface);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.task-header__delete:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.task-header__delete:focus-visible {
  outline: 2px solid var(--accent);
}

@media (max-width: 900px) {
  .task-header__title {
    font-size: 26px;
  }
  .task-header__top {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
  }
  .task-header__actions {
    width: 100%;
    justify-content: space-between;
  }
}
`;
