import { escapeHtml } from "../utils";

export interface EmptyStateProps {
  message: string;
  hint?: string;
}

export function emptyState({ message, hint }: EmptyStateProps): string {
  return `
    <div class="empty-state">
      <div class="empty-state__icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <path d="M12 8v4m0 4h.01"/>
        </svg>
      </div>
      <p class="empty-state__message">${escapeHtml(message)}</p>
      ${hint ? `<p class="empty-state__hint">${escapeHtml(hint)}</p>` : ""}
    </div>
  `;
}

export const emptyStateCSS = /* css */ `
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--sp-9) var(--sp-7);
  text-align: center;
  min-height: 200px;
}
.empty-state__icon {
  color: var(--text-muted);
  margin-bottom: var(--sp-4);
  opacity: 0.5;
}
.empty-state__message {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
}
.empty-state__hint {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: var(--sp-2);
}
`;
