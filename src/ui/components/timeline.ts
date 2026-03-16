import { escapeHtml, formatDate, padOrdinal, renderMaybeUrl } from "../utils";
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
  if (event.type.startsWith("browser.action.")) {
    const phase = event.type.slice("browser.action.".length).replaceAll("_", " ");
    const actionType = typeof event.payload.actionType === "string" ? event.payload.actionType : "action";
    return `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} ${phase}`;
  }
  if (event.type === "browser.event_linked") {
    const browserEvent = typeof event.payload.event === "string" ? event.payload.event.replaceAll("_", " ") : "browser event";
    return browserEvent.charAt(0).toUpperCase() + browserEvent.slice(1);
  }
  // Produce a readable label from the event type
  const t = event.type || "";
  // e.g. "task.created" -> "Task created", "agent.note_added" -> "Note added"
  const parts = t.split(".");
  const action = (parts[parts.length - 1] || t).replaceAll("_", " ");
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function eventDescription(event: TimelineEvent): string {
  const p = event.payload || {};
  if (typeof p.description === "string") return p.description;
  if (event.type === "browser.event_linked") {
    const browserEvent = typeof p.event === "string" ? p.event : "event";
    const url = typeof p.url === "string" ? p.url : undefined;
    return url ? `${browserEvent}: ${url}` : browserEvent;
  }
  // Try common payload fields for a description string
  if (typeof p.message === "string") return p.message;
  if (typeof p.title === "string") return p.title;
  if (typeof p.label === "string") return p.label;
  if (typeof p.text === "string") return p.text;
  if (typeof p.summary === "string") return p.summary;
  if (typeof p.status === "string") return `Status: ${p.status}`;
  return "";
}

function eventDetails(event: TimelineEvent): string[] {
  const p = event.payload || {};
  const details: string[] = [];

  if (typeof p.pageTitle === "string") details.push(p.pageTitle);
  if (typeof p.pageUrl === "string") details.push(p.pageUrl);
  if (typeof p.ref === "number") details.push(`ref ${p.ref}`);
  if (typeof p.key === "string") details.push(`key ${p.key}`);
  if (typeof p.selector === "string") details.push(`selector ${p.selector}`);
  if (typeof p.state === "string") details.push(`state ${p.state}`);
  if (typeof p.durationMs === "number") details.push(`${p.durationMs}ms`);
  if (typeof p.success === "boolean") details.push(p.success ? "success" : "failed");
  if (typeof p.error === "string") details.push(`error: ${p.error}`);
  if (Array.isArray(p.values) && p.values.length > 0) details.push(`values: ${p.values.join(", ")}`);
  if (Array.isArray(p.riskTags) && p.riskTags.length > 0) details.push(`risk: ${p.riskTags.join(", ")}`);

  return details;
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
    const details = eventDetails(event);
    return `
      <div class="tl-item">
        <div class="tl-item__top">
          <span class="tl-item__ordinal">${padOrdinal(i + 1)}</span>
          <span class="tl-item__label">${escapeHtml(eventLabel(event))}</span>
        </div>
        ${desc ? `<p class="tl-item__desc">${renderMaybeUrl(desc)}</p>` : ""}
        ${details.length > 0 ? `<div class="tl-item__details">${details.map((detail) => `<span class="tl-item__detail">${renderMaybeUrl(detail)}</span>`).join("")}</div>` : ""}
        <span class="tl-item__meta">${escapeHtml(formatDate(event.createdAt))} &middot; ${escapeHtml(event.actor)}</span>
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
  flex-direction: row;
  gap: var(--sp-3);
  overflow-x: auto;
  padding-bottom: var(--sp-3);
  scroll-snap-type: x mandatory;
}

.tl-item {
  flex-shrink: 0;
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  scroll-snap-align: start;
  transition: box-shadow 0.15s;
}

.tl-item:hover {
  box-shadow: var(--shadow-card);
}

.tl-item__top {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.tl-item__ordinal {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 800;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tl-item__label {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tl-item__desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tl-item__meta {
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--text-muted);
  margin-top: auto;
}

.tl-item__details {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}

.tl-item__detail {
  font-size: 11px;
  line-height: 1.2;
  color: var(--text-secondary);
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 6px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-more {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: var(--sp-4);
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .tl-item {
    width: 180px;
  }
}
`;
