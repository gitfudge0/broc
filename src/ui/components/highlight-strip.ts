import { escapeHtml } from "../utils";

export interface HighlightItem {
  id: string;
  label: string;
  value: string;
}

export interface HighlightStripProps {
  items: HighlightItem[];
}

export function highlightStrip({ items }: HighlightStripProps): string {
  if (!items || items.length === 0) return "";

  const cells = items.map((item) => `
    <div class="hl-strip__item">
      <span class="hl-strip__label">${escapeHtml(item.label)}</span>
      <span class="hl-strip__value">${escapeHtml(item.value)}</span>
    </div>
  `).join("");

  return `
    <div class="hl-strip">
      ${cells}
    </div>
  `;
}

export const highlightStripCSS = /* css */ `
.hl-strip {
  display: flex;
  gap: 0;
  padding: var(--sp-4) 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--sp-6);
  overflow-x: auto;
}

.hl-strip__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 var(--sp-6);
  border-right: 1px solid var(--border);
  min-width: 0;
  flex-shrink: 0;
}

.hl-strip__item:first-child {
  padding-left: 0;
}

.hl-strip__item:last-child {
  border-right: none;
}

.hl-strip__label {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.hl-strip__value {
  font-family: var(--font-body);
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  letter-spacing: -0.02em;
}

@media (max-width: 900px) {
  .hl-strip {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-4);
  }
  .hl-strip__item {
    padding: 0;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--sp-3);
  }
  .hl-strip__item:last-child {
    border-bottom: none;
  }
  .hl-strip__value {
    max-width: none;
  }
}
`;
