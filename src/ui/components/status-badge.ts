import { escapeHtml, formatStatus } from "../utils";

export interface StatusBadgeProps {
  status: string;
}

export function statusBadge({ status }: StatusBadgeProps): string {
  const s = escapeHtml(status);
  return `<span class="status-badge status-badge--${s}">${escapeHtml(formatStatus(status))}</span>`;
}

export const statusBadgeCSS = /* css */ `
.status-badge {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  white-space: nowrap;
  line-height: 1.3;
}
.status-badge--running   { background: var(--status-running-bg);   color: var(--status-running-fg);   border-color: var(--status-running-fg); }
.status-badge--completed { background: var(--status-completed-bg); color: var(--status-completed-fg); }
.status-badge--failed    { background: var(--status-failed-bg);    color: var(--status-failed-fg); }
.status-badge--blocked   { background: var(--status-blocked-bg);   color: var(--status-blocked-fg); }
.status-badge--pending   { background: var(--status-pending-bg);   color: var(--status-pending-fg); border-color: var(--border); }
.status-badge--waiting   { background: var(--status-waiting-bg);   color: var(--status-waiting-fg); border-color: var(--border); }
.status-badge--archived  { background: var(--status-archived-bg);  color: var(--status-archived-fg); }
`;
