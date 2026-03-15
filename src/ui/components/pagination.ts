import { padOrdinal } from "../utils";

export interface PaginationProps {
  current: number;
  total: number;
  /** If set, these data attributes are placed on the arrows for event binding. */
  dataAttr?: string;
}

export function pagination({ current, total, dataAttr }: PaginationProps): string {
  const attr = dataAttr ? ` data-pagination="${dataAttr}"` : "";
  const canPrev = current > 1;
  const canNext = current < total;
  return `
    <div class="pagination">
      <button class="pagination__arrow${canPrev ? "" : " pagination__arrow--disabled"}"${attr} data-dir="prev" aria-label="Previous" ${canPrev ? "" : "disabled"}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
      </button>
      <span class="pagination__label">
        <span class="pagination__current">${padOrdinal(current)}</span>
        <span class="pagination__sep">/</span>
        <span class="pagination__total">${padOrdinal(total)}</span>
      </span>
      <button class="pagination__arrow${canNext ? "" : " pagination__arrow--disabled"}"${attr} data-dir="next" aria-label="Next" ${canNext ? "" : "disabled"}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m0 0l-7-7m7 7l-7 7"/></svg>
      </button>
    </div>
  `;
}

export const paginationCSS = /* css */ `
.pagination {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-3);
}
.pagination__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  color: var(--text-primary);
  transition: background 0.15s;
}
.pagination__arrow:hover:not(:disabled) {
  background: var(--surface-hover);
}
.pagination__arrow--disabled {
  opacity: 0.25;
  cursor: default;
}
.pagination__label {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}
.pagination__current {
  color: var(--text-primary);
}
.pagination__sep {
  margin: 0 2px;
  color: var(--text-muted);
}
`;
