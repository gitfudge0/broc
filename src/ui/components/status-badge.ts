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
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
  line-height: 1.4;
}
.status-badge--running   { background: var(--status-running-bg);   color: var(--status-running-fg); }
.status-badge--completed { background: var(--status-completed-bg); color: var(--status-completed-fg); }
.status-badge--failed    { background: var(--status-failed-bg);    color: var(--status-failed-fg); }
.status-badge--blocked   { background: var(--status-blocked-bg);   color: var(--status-blocked-fg); }
.status-badge--pending   { background: var(--status-pending-bg);   color: var(--status-pending-fg); }
.status-badge--waiting   { background: var(--status-waiting-bg);   color: var(--status-waiting-fg); }
.status-badge--archived  { background: var(--status-archived-bg);  color: var(--status-archived-fg); }
`;
