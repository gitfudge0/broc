/**
 * Broc Notebook UI -- entry point.
 *
 * Fetches notebook data from the local API and renders the full UI
 * using the component library. No framework -- just vanilla TS
 * composing (props) => string component functions.
 */

import { escapeHtml } from "./utils";
import { themeCSS } from "./theme";
import { layoutShell, layoutShellCSS } from "./components/layout-shell";
import { sidebar, sidebarCSS } from "./components/sidebar";
import { taskListItemCSS } from "./components/task-list-item";
import { taskHeader, taskHeaderCSS } from "./components/task-header";
import { highlightStrip, highlightStripCSS } from "./components/highlight-strip";
import { timeline, timelineCSS } from "./components/timeline";
import { sectionList, sectionCardCSS } from "./components/section-card";
import { artifactGallery, artifactGalleryCSS } from "./components/artifact-gallery";
import { statusBadgeCSS } from "./components/status-badge";
import { tagPillCSS } from "./components/tag-pill";
import { emptyState, emptyStateCSS } from "./components/empty-state";
import { paginationCSS } from "./components/pagination";
import { themeToggleCSS, bindThemeToggle } from "./components/theme-toggle";

type NotebookTaskStatus = "pending" | "running" | "waiting" | "blocked" | "completed" | "failed" | "archived";

interface NotebookTaskSummary {
  id: string;
  title: string;
  status: NotebookTaskStatus;
  updatedAt: string;
  createdAt: string;
  tags?: string[];
  summary?: string;
}

interface NotebookSection {
  id: string;
  title: string;
  kind: string;
  content: unknown;
}

interface NotebookView {
  summary?: string;
  sections?: NotebookSection[];
  highlights?: Array<{ id: string; label: string; value: string }>;
  suggestedActions?: Array<{ id: string; label: string; kind: string; payload?: Record<string, unknown> }>;
  [key: string]: unknown;
}

interface NotebookTaskRecord {
  meta: {
    id: string;
    title: string;
    status: NotebookTaskStatus;
    updatedAt: string;
    createdAt: string;
    tags?: string[];
    artifacts: Array<{ id: string; name: string; kind: string; mimeType?: string; size: number; createdAt: string }>;
  };
  view: NotebookView;
  events?: Array<{ id: string; type: string; createdAt: string; actor: string; payload: Record<string, unknown> }>;
}

interface NotebookPayload {
  tasks: NotebookTaskSummary[];
  selectedTask: NotebookTaskRecord | null;
  selectedTaskId: string | null;
}

const API_BASE = `${window.location.origin}/notebook-api`;

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function allStyles(): string {
  return [
    themeCSS,
    layoutShellCSS,
    sidebarCSS,
    taskListItemCSS,
    statusBadgeCSS,
    tagPillCSS,
    emptyStateCSS,
    paginationCSS,
    taskHeaderCSS,
    highlightStripCSS,
    timelineCSS,
    sectionCardCSS,
    artifactGalleryCSS,
    mainContentCSS,
    themeToggleCSS,
  ].join("\n");
}

const mainContentCSS = /* css */ `
.main-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
}

.content-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-7);
}

.content-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.content-action {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  text-decoration: none;
  color: var(--text-primary);
  background: var(--surface-muted);
}

.content-timeline {
  margin-top: var(--sp-7);
  padding-top: var(--sp-5);
  border-top: 1px solid var(--border);
}

.content-timeline__header {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  padding-bottom: var(--sp-3);
  margin-bottom: var(--sp-3);
  border-bottom: 1px solid var(--border);
}
`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function titleizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (isPlainObject(value)) return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
  return "";
}

function inferSectionKind(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return "list";
    if (value.every(isPlainObject)) return "table";
  }
  if (isPlainObject(value)) return "key_value";
  if (typeof value === "string" && value.includes("\n```")) return "markdown";
  return "text";
}

function inferSectionContent(value: unknown): unknown {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return value;
}

function normalizeView(view: NotebookView): NotebookView {
  const sections = Array.isArray(view.sections)
    ? view.sections.map((section, index) => ({
        id: typeof section?.id === "string" && section.id ? section.id : `section-${index}`,
        title: typeof section?.title === "string" && section.title ? section.title : `Section ${index + 1}`,
        kind: typeof section?.kind === "string" && section.kind ? section.kind : inferSectionKind(section?.content),
        content: section?.content,
      }))
    : [];
  const highlights = Array.isArray(view.highlights) ? [...view.highlights] : [];
  const knownKeys = new Set(["summary", "sections", "highlights", "suggestedActions"]);

  for (const [key, value] of Object.entries(view)) {
    if (knownKeys.has(key) || value === undefined || value === null) continue;
    if ((typeof value === "string" || typeof value === "number" || typeof value === "boolean") && String(value).length <= 80) {
      highlights.push({
        id: `fallback-highlight-${key}`,
        label: titleizeKey(key),
        value: String(value),
      });
      continue;
    }

    sections.push({
      id: `fallback-section-${key}`,
      title: titleizeKey(key),
      kind: inferSectionKind(value),
      content: inferSectionContent(value),
    });
  }

  const summary = typeof view.summary === "string"
    ? view.summary
    : (typeof view.task === "string" ? view.task : undefined)
      || (typeof view.status === "string" ? view.status : undefined)
      || summarizeValue(view.sections);

  return {
    ...view,
    summary,
    highlights,
    sections,
  };
}

function renderSuggestedActions(view: NotebookView): string {
  if (!Array.isArray(view.suggestedActions) || view.suggestedActions.length === 0) return "";
  return `
    <div class="content-actions">
      ${view.suggestedActions.map((action) => {
        const href = typeof action.payload?.url === "string" ? action.payload.url : "#";
        return `<a class="content-action" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(action.label)}</a>`;
      }).join("")}
    </div>
  `;
}

function renderMainContent(task: NotebookTaskRecord | null): string {
  if (!task) {
    return `<div class="main-empty">${emptyState({ message: "Select a notebook to view", hint: "Pick one from the sidebar." })}</div>`;
  }

  const view = normalizeView(task.view);
  const header = taskHeader({
    title: task.meta.title,
    summary: view.summary,
    status: task.meta.status,
    createdAt: task.meta.createdAt,
    updatedAt: task.meta.updatedAt,
    tags: task.meta.tags,
  });
  const highlights = highlightStrip({ items: view.highlights || [] });
  const actions = renderSuggestedActions(view);
  const sections = sectionList({ sections: view.sections || [] });
  const artifacts = artifactGallery({
    artifacts: task.meta.artifacts,
    taskId: task.meta.id,
    apiBase: API_BASE,
  });
  const tl = timeline({ events: task.events || [] });

  return `
    ${header}
    ${highlights}
    <div class="content-body">
      ${actions}
      ${sections}
      ${task.meta.artifacts.length > 0 ? artifacts : ""}
    </div>
    <div class="content-timeline">
      <div class="content-timeline__header">Timeline</div>
      ${tl}
    </div>
  `;
}

function bindInteractions(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.taskId;
      if (taskId) {
        const url = new URL(window.location.href);
        url.searchParams.set("task", taskId);
        window.location.href = url.toString();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-delete-task-id]").forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = button.dataset.deleteTaskId;
      if (!taskId) return;
      try {
        const resp = await fetch(`${API_BASE}/task/${encodeURIComponent(taskId)}`, { method: "DELETE", credentials: "same-origin" });
        if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`);
        const url = new URL(window.location.href);
        url.searchParams.delete("task");
        window.location.href = url.toString();
      } catch (err) {
        console.error("Failed to delete task", err);
      }
    });
  });
}

function bindSidebarCollapse(): void {
  const shell = document.querySelector(".shell");
  const collapseBtn = document.getElementById("sidebar-collapse-btn");
  const expandBtn = document.getElementById("sidebar-expand-btn");
  const mobileMq = window.matchMedia("(max-width: 900px)");

  function toggle(collapsed: boolean): void {
    if (!shell) return;
    if (mobileMq.matches) {
      shell.classList.remove("shell--collapsed");
      localStorage.setItem("broc-sidebar-collapsed", "0");
      return;
    }
    shell.classList.toggle("shell--collapsed", collapsed);
    localStorage.setItem("broc-sidebar-collapsed", collapsed ? "1" : "0");
  }

  collapseBtn?.addEventListener("click", () => toggle(true));
  expandBtn?.addEventListener("click", () => toggle(false));
  mobileMq.addEventListener("change", () => {
    if (mobileMq.matches) {
      shell?.classList.remove("shell--collapsed");
      return;
    }
    if (localStorage.getItem("broc-sidebar-collapsed") === "1") {
      shell?.classList.add("shell--collapsed");
    }
  });
}

const appEl = document.getElementById("app");

function render(payload: NotebookPayload): void {
  if (!appEl) return;

  const sidebarHtml = sidebar({
    tasks: payload.tasks,
    selectedTaskId: payload.selectedTaskId,
  });

  const mainHtml = renderMainContent(payload.selectedTask);

  appEl.innerHTML = `
    <style>${allStyles()}</style>
    ${layoutShell({ sidebar: sidebarHtml, main: mainHtml })}
  `;

  const isCollapsed = localStorage.getItem("broc-sidebar-collapsed") === "1";
  if (isCollapsed && !window.matchMedia("(max-width: 900px)").matches) {
    document.querySelector(".shell")?.classList.add("shell--collapsed");
  }

  bindInteractions();
  bindThemeToggle();
  bindSidebarCollapse();
}

async function load(): Promise<void> {
  const search = new URLSearchParams(window.location.search);
  const selectedTaskId = search.get("task");
  const tasks = await requestJson<NotebookTaskSummary[]>(`${API_BASE}/tasks`);
  const resolvedTaskId = selectedTaskId || tasks[0]?.id || null;

  let selectedTask: NotebookTaskRecord | null = null;
  if (resolvedTaskId) {
    try {
      selectedTask = await requestJson<NotebookTaskRecord>(
        `${API_BASE}/task/${encodeURIComponent(resolvedTaskId)}?events=1`,
      );
    } catch (e) {
      console.error("Failed to load task", e);
    }
  }

  render({ tasks, selectedTaskId: resolvedTaskId, selectedTask });
}

void load().catch((error) => {
  if (appEl) {
    appEl.innerHTML = `<pre style="padding:2rem;color:#8a2820">${escapeHtml(error instanceof Error ? error.message : String(error))}</pre>`;
  }
});
