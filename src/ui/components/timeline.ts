import { escapeHtml, formatDate, padOrdinal } from "../utils";
import { emptyState } from "./empty-state";

export interface TimelineEvent {
  id: string;
  type: string;
  createdAt: string;
  actor: string;
  payload: Record<string, unknown>;
}

export interface TimelineProps {
  events: TimelineEvent[];
  /** Max items to show before truncating. Default 15. */
  limit?: number;
}

function eventLabel(event: TimelineEvent): string {
  // Produce a readable label from the event type
  const t = event.type || "";
  // e.g. "task.created" -> "Task created", "agent.note_added" -> "Note added"
  const parts = t.split(".");
  const action = (parts[parts.length - 1] || t).replaceAll("_", " ");
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function eventDescription(event: TimelineEvent): string {
  const p = event.payload || {};
  // Try common payload fields for a description string
  if (typeof p.message === "string") return p.message;
  if (typeof p.title === "string") return p.title;
  if (typeof p.label === "string") return p.label;
  if (typeof p.text === "string") return p.text;
  if (typeof p.summary === "string") return p.summary;
  if (typeof p.status === "string") return `Status: ${p.status}`;
  return "";
}

export function timeline({ events, limit = 15 }: TimelineProps): string {
  if (!events || events.length === 0) {
    return emptyState({ message: "No events yet", hint: "Events appear as the agent works." });
  }

  // Sort newest-first (descending createdAt)
  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const shown = sorted.slice(0, limit);
  const hasMore = sorted.length > limit;

  const items = shown.map((event, i) => {
    const desc = eventDescription(event);
    return `
      <div class="tl-item">
        <div class="tl-item__left">
          <span class="tl-item__ordinal">${padOrdinal(i + 1)}</span>
          <span class="tl-item__rule"></span>
        </div>
        <div class="tl-item__body">
          <span class="tl-item__label">${escapeHtml(eventLabel(event))}</span>
          ${desc ? `<p class="tl-item__desc">${escapeHtml(desc)}</p>` : ""}
          <span class="tl-item__meta">${escapeHtml(formatDate(event.createdAt))} &middot; ${escapeHtml(event.actor)}</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="tl">
      ${items}
      ${hasMore ? `<div class="tl-more"><span class="body-sm">${events.length - limit} more events</span></div>` : ""}
    </div>
  `;
}

export const timelineCSS = /* css */ `
.tl {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tl-item {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4) 0;
  border-bottom: 1px solid var(--border);
}

.tl-item:last-child {
  border-bottom: none;
}

.tl-item__left {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-shrink: 0;
  padding-top: 2px;
}

.tl-item__ordinal {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
  min-width: 22px;
}

.tl-item__rule {
  width: 20px;
  height: 1px;
  background: var(--border-strong);
}

.tl-item__body {
  min-width: 0;
  flex: 1;
}

.tl-item__label {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.tl-item__desc {
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-secondary);
  margin-top: var(--sp-1);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tl-item__meta {
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--text-muted);
  margin-top: var(--sp-1);
  display: block;
}

.tl-more {
  padding: var(--sp-3) 0;
  text-align: center;
}
`;
