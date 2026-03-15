import { escapeHtml } from "../utils";
import { emptyState } from "./empty-state";

export interface SectionData {
  id: string;
  title: string;
  kind: string;
  content: unknown;
}

export interface SectionCardProps {
  section: SectionData;
}

function renderContent(kind: string, content: unknown): string {
  switch (kind) {
    case "text":
      return `<div class="sc__text">${escapeHtml(String(content || ""))}</div>`;

    case "list": {
      const items = Array.isArray(content) ? content : [];
      if (items.length === 0) return `<p class="body-sm">Empty list.</p>`;
      return `<ul class="sc__list">${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>`;
    }

    case "table": {
      const rows = Array.isArray(content) ? content : [];
      if (rows.length === 0) return `<p class="body-sm">Empty table.</p>`;
      // Assume first row is header
      const header = rows[0] as Record<string, unknown>;
      const keys = Object.keys(header);
      const thead = `<tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr>`;
      const tbody = rows.map((row: unknown) => {
        const r = row as Record<string, unknown>;
        return `<tr>${keys.map((k) => `<td>${escapeHtml(String(r[k] ?? ""))}</td>`).join("")}</tr>`;
      }).join("");
      return `<div class="sc__table-wrap"><table class="sc__table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
    }

    case "html":
      // Content is trusted HTML from the agent -- render directly
      return `<div class="sc__html">${String(content || "")}</div>`;

    default:
      // Fallback: pretty-print JSON
      return `<pre class="sc__pre">${escapeHtml(JSON.stringify(content, null, 2))}</pre>`;
  }
}

export function sectionCard({ section }: SectionCardProps): string {
  return `
    <div class="sc">
      <h3 class="sc__title">${escapeHtml(section.title)}</h3>
      ${renderContent(section.kind, section.content)}
    </div>
  `;
}

export interface SectionListProps {
  sections: SectionData[];
}

export function sectionList({ sections }: SectionListProps): string {
  if (!sections || sections.length === 0) {
    return emptyState({ message: "No sections yet", hint: "The agent adds sections as it works." });
  }
  return `<div class="sc-list">${sections.map((s) => sectionCard({ section: s })).join("")}</div>`;
}

export const sectionCardCSS = /* css */ `
.sc-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

.sc {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-6);
  box-shadow: var(--shadow-card);
}

.sc__title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: var(--sp-4);
}

.sc__text {
  font-size: 15px;
  line-height: 1.65;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.sc__list {
  margin: 0;
  padding-left: var(--sp-5);
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}
.sc__list li { margin-bottom: var(--sp-1); }

.sc__table-wrap {
  overflow-x: auto;
}
.sc__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-display);
  font-size: 13px;
}
.sc__table th, .sc__table td {
  text-align: left;
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--border);
}
.sc__table th {
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
}
.sc__table td {
  color: var(--text-secondary);
}

.sc__html {
  line-height: 1.6;
}
.sc__html img {
  border-radius: var(--radius-md);
  margin: var(--sp-3) 0;
}

.sc__pre {
  overflow: auto;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--sp-4);
  font-size: 12px;
  line-height: 1.55;
  margin: 0;
}
`;
