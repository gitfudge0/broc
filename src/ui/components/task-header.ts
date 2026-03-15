import { escapeHtml, formatDate, formatDateTime } from "../utils";
import { statusBadge } from "./status-badge";
import { tagList } from "./tag-pill";

export interface TaskHeaderProps {
  title: string;
  summary?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export function taskHeader({ title, summary, status, createdAt, updatedAt, tags }: TaskHeaderProps): string {
  return `
    <header class="task-header">
      <div class="task-header__top">
        <div class="task-header__meta-left">
          <div class="task-header__meta-item">
            <span class="eyebrow">Created</span>
            <span class="task-header__meta-value">${escapeHtml(formatDateTime(createdAt))}</span>
          </div>
          <div class="task-header__meta-item">
            <span class="eyebrow">Updated</span>
            <span class="task-header__meta-value">${escapeHtml(formatDate(updatedAt))}</span>
          </div>
        </div>
        ${statusBadge({ status })}
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
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--sp-5);
}

.task-header__meta-left {
  display: flex;
  gap: var(--sp-7);
}

.task-header__meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.task-header__meta-value {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.task-header__title {
  font-size: clamp(28px, 4vw, 42px);
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.08;
  max-width: 18ch;
  margin-bottom: var(--sp-4);
}

.task-header__summary {
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-secondary);
  max-width: 55ch;
}

.task-header__tags {
  margin-top: var(--sp-4);
}

@media (max-width: 900px) {
  .task-header__title {
    font-size: 26px;
  }
  .task-header__top {
    flex-direction: column;
    gap: var(--sp-3);
  }
}
`;
