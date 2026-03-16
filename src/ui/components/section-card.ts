import { escapeHtml, renderMaybeUrl } from "../utils";
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function renderKeyValue(content: unknown): string {
  const entries = Object.entries(asRecord(content));
  if (entries.length === 0) return `<p class="body-sm">No fields.</p>`;
  return `
    <dl class="sc__facts">
      ${entries.map(([key, value]) => `
        <div class="sc__fact">
          <dt>${escapeHtml(key)}</dt>
          <dd>${renderMaybeUrl(String(value ?? ""))}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderTextBlock(content: unknown): string {
  return `<div class="sc__text">${escapeHtml(String(content || ""))}</div>`;
}

function renderMarkdown(content: unknown): string {
  const escaped = escapeHtml(String(content || ""));
  const html = escaped
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br />");
  return `<div class="sc__markdown"><p>${html}</p></div>`;
}

function renderList(content: unknown): string {
  const items = asArray(content);
  if (items.length === 0) return `<p class="body-sm">Empty list.</p>`;
  return `<ul class="sc__list">${items.map((item) => `<li>${renderMaybeUrl(String(item ?? ""))}</li>`).join("")}</ul>`;
}

function renderChecklist(content: unknown): string {
  const items = asArray(content);
  if (items.length === 0) return `<p class="body-sm">No checklist items.</p>`;
  return `
    <div class="sc__checklist">
      ${items.map((item) => {
        const row = typeof item === "string" ? { label: item, checked: false } : asRecord(item);
        return `
          <div class="sc__check">
            <span class="sc__check-mark">${row.checked ? "✓" : ""}</span>
            <span class="sc__check-label">${escapeHtml(String(row.label ?? ""))}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderMetrics(content: unknown): string {
  const items = asArray(content);
  if (items.length === 0) return renderKeyValue(content);
  return `
    <div class="sc__metrics">
      ${items.map((item) => {
        const row = asRecord(item);
        return `
          <div class="sc__metric">
            <span class="sc__metric-label">${escapeHtml(String(row.label ?? ""))}</span>
            <span class="sc__metric-value">${escapeHtml(String(row.value ?? ""))}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderLinks(content: unknown): string {
  const items = asArray(content);
  if (items.length === 0) return `<p class="body-sm">No links.</p>`;
  return `
    <div class="sc__links">
      ${items.map((item) => {
        const row = typeof item === "string" ? { label: item, url: item } : asRecord(item);
        const url = String(row.url ?? "");
        return `
          <a class="sc__link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
            <span>${escapeHtml(String(row.label ?? url))}</span>
            <span class="sc__link-url">${escapeHtml(url)}</span>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

function renderTable(content: unknown): string {
  const rows = asArray(content);
  if (rows.length === 0) return `<p class="body-sm">Empty table.</p>`;
  const first = asRecord(rows[0]);
  const keys = Object.keys(first);
  if (keys.length === 0) return `<p class="body-sm">Empty table.</p>`;
  const thead = `<tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr>`;
  const tbody = rows.map((row) => {
    const record = asRecord(row);
    return `<tr>${keys.map((k) => `<td>${renderMaybeUrl(String(record[k] ?? ""))}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="sc__table-wrap"><table class="sc__table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

function renderCode(content: unknown, json = false): string {
  const value = json ? JSON.stringify(content, null, 2) : String(content ?? "");
  return `<pre class="sc__pre"><code>${escapeHtml(value)}</code></pre>`;
}

function renderDiff(content: unknown): string {
  const lines = String(content ?? "").split("\n");
  return `
    <pre class="sc__pre sc__pre--diff"><code>${lines.map((line) => {
      const klass = line.startsWith("+") ? "sc__diff-line--add" : line.startsWith("-") ? "sc__diff-line--remove" : "";
      return `<span class="${klass}">${escapeHtml(line)}</span>`;
    }).join("\n")}</code></pre>
  `;
}

function renderMedia(content: unknown): string {
  const items = asArray(content);
  if (items.length === 0) return `<p class="body-sm">No media.</p>`;
  return `
    <div class="sc__media-grid">
      ${items.map((item) => {
        const row = asRecord(item);
        const src = String(row.src ?? row.url ?? "");
        const alt = String(row.alt ?? row.label ?? "");
        return `
          <figure class="sc__media">
            <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />
            ${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ""}
          </figure>
        `;
      }).join("")}
    </div>
  `;
}

function renderContent(kind: string, content: unknown): string {
  switch (kind) {
    case "text":
      return renderTextBlock(content);
    case "markdown":
      return renderMarkdown(content);
    case "key_value":
      return renderKeyValue(content);
    case "list":
      return renderList(content);
    case "checklist":
      return renderChecklist(content);
    case "metrics":
      return renderMetrics(content);
    case "links":
      return renderLinks(content);
    case "table":
      return renderTable(content);
    case "code":
      return renderCode(content);
    case "json":
      return renderCode(content, true);
    case "diff":
      return renderDiff(content);
    case "media":
      return renderMedia(content);
    case "html":
      return `<div class="sc__html">${String(content || "")}</div>`;
    case "timeline":
      return `<div class="sc__callout">Timeline data is rendered in the timeline panel below.</div>`;
    case "artifact_gallery":
      return `<div class="sc__callout">Artifacts appear in the gallery below.</div>`;
    default:
      return renderCode(content, true);
  }
}

export function sectionCard({ section }: SectionCardProps): string {
  const kind = typeof section.kind === "string" && section.kind.trim() ? section.kind : "text";
  return `
    <div class="sc" data-kind="${escapeHtml(kind)}">
      <div class="sc__topline">${escapeHtml(kind.replaceAll("_", " "))}</div>
      <h3 class="sc__title">${escapeHtml(section.title)}</h3>
      ${renderContent(kind, section.content)}
    </div>
  `;
}

export interface SectionListProps {
  sections: SectionData[];
}

export function sectionList({ sections }: SectionListProps): string {
  if (!sections || sections.length === 0) {
    return emptyState({ message: "No notebook sections yet", hint: "The agent can add structured notebook sections as it works." });
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
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 90%, white 10%), var(--surface));
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-6);
  box-shadow: var(--shadow-card);
}

.sc__topline {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  margin-bottom: var(--sp-2);
}

.sc__title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: var(--sp-4);
}

.sc__text,
.sc__markdown {
  font-size: 15px;
  line-height: 1.65;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.sc__markdown p:first-child {
  margin-top: 0;
}

.sc__markdown p:last-child {
  margin-bottom: 0;
}

.sc__markdown h2,
.sc__markdown h3,
.sc__markdown h4 {
  color: var(--text-primary);
  margin: var(--sp-4) 0 var(--sp-2);
}

.sc__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--sp-3);
  margin: 0;
}

.sc__fact {
  padding: var(--sp-3);
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.sc__fact dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: var(--sp-1);
}

.sc__fact dd {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.sc__list {
  margin: 0;
  padding-left: var(--sp-5);
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.sc__checklist,
.sc__links {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.sc__check {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.sc__check-mark {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-size: 12px;
  flex-shrink: 0;
}

.sc__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-3);
}

.sc__metric {
  padding: var(--sp-4);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  border: 1px solid var(--border);
}

.sc__metric-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.sc__metric-value {
  display: block;
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--text-primary);
  margin-top: var(--sp-2);
}

.sc__link {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
  text-decoration: none;
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  background: var(--surface-muted);
}

.sc__link-url {
  color: var(--text-muted);
  font-size: 12px;
}

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

.sc__pre--diff .sc__diff-line--add {
  color: #24663b;
}

.sc__pre--diff .sc__diff-line--remove {
  color: #7d2230;
}

.sc__media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-3);
}

.sc__media img {
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.sc__media figcaption {
  margin-top: var(--sp-2);
  color: var(--text-muted);
  font-size: 12px;
}

.sc__html {
  line-height: 1.6;
}

.sc__callout {
  padding: var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border);
  color: var(--text-muted);
  background: var(--surface-muted);
}
`;
