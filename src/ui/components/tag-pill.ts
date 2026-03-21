import { escapeHtml } from "../utils";

export interface TagPillProps {
  tag: string;
}

export function tagPill({ tag }: TagPillProps): string {
  return `<span class="tag-pill">${escapeHtml(tag)}</span>`;
}

export function tagList(tags: string[]): string {
  if (!tags || tags.length === 0) return "";
  return `<div class="tag-list">${tags.map((tag) => tagPill({ tag })).join("")}</div>`;
}

export const tagPillCSS = /* css */ `
.tag-pill {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  color: var(--text-muted);
  white-space: nowrap;
  line-height: 1.4;
  letter-spacing: 0.02em;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
`;
