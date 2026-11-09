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
import { timeline, timelineCSS } from "./components/timeline";
import { sectionList, sectionCardCSS } from "./components/section-card";
import { statusBadgeCSS } from "./components/status-badge";
import { tagPillCSS } from "./components/tag-pill";
import { emptyState, emptyStateCSS } from "./components/empty-state";
import { paginationCSS } from "./components/pagination";
import { themeToggleCSS, bindThemeToggle } from "./components/theme-toggle";
import { createShowcaseTask, SHOWCASE_TASK_ID } from "./showcase";

type NotebookTaskStatus = "pending" | "running" | "waiting" | "blocked" | "completed" | "failed" | "archived";

interface NotebookTaskSummary {
  id: string;
  title: string;
  status: NotebookTaskStatus;
  updatedAt: string;
  createdAt: string;
  tags?: string[];
  summary?: string;
  pinned?: boolean;
  deletable?: boolean;
}

interface NotebookSection {
  id: string;
  title: string;
  kind: string;
  tab?: "final-output";
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
    artifacts: Array<{ id: string; name: string; kind: string; mimeType?: string; size: number; createdAt: string; href?: string; thumbnailSrc?: string }>;
  };
  view: NotebookView;
  workflow: {
    milestones?: Array<{ id: string; title: string; summary: string; createdAt: string; screenshotArtifactId?: string }>;
    gatheredResults?: Array<{ id: string; label: string; value: string; source?: string; fields?: Record<string, string> }>;
    finalOutput?: {
      summary?: string;
      details?: string;
      gathered?: Array<{ id?: string; label: string; value: string; source?: string; fields?: Record<string, string> }>;
      screenshotArtifactId?: string;
    };
  };
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
    timelineCSS,
    sectionCardCSS,
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
  gap: var(--sp-6);
}

.content-timeline {
  margin-top: var(--sp-6);
  padding-top: var(--sp-4);
  border-top: 1px solid var(--border);
}

.content-timeline__header {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  padding-bottom: var(--sp-3);
  margin-bottom: var(--sp-3);
}

.task-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.task-tab {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.task-tab[aria-selected="true"] {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--surface-muted);
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

.workflow-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-5);
}

.workflow-panel__title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: var(--sp-3);
}

.milestone-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.milestone-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--sp-4);
  background: var(--surface-muted);
}

.markdown-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-6);
}

.markdown-panel__body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.markdown-panel__body p:first-child {
  margin-top: 0;
}

.markdown-panel__body p:last-child {
  margin-bottom: 0;
}

.markdown-panel__body h1,
.markdown-panel__body h2,
.markdown-panel__body h3,
.markdown-panel__body h4 {
  color: var(--text-primary);
  margin: var(--sp-5) 0 var(--sp-2);
}

.markdown-panel__body ul,
.markdown-panel__body ol {
  padding-left: var(--sp-5);
}

.markdown-panel__body code {
  font-family: var(--font-mono);
  font-size: 0.95em;
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
        tab: typeof section?.tab === "string" ? "final-output" : undefined,
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

function getSection(view: NotebookView, id: string): NotebookSection | null {
  return (view.sections || []).find((section) => section.id === id) ?? null;
}

function renderMarkdownPanel(content: unknown): string {
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
  return `<div class="markdown-panel"><div class="markdown-panel__body"><p>${html}</p></div></div>`;
}


function renderMilestones(task: NotebookTaskRecord): string {
  const milestones = task.workflow.milestones || [];
  if (milestones.length === 0) return "";
  return `
    <div class="workflow-panel">
      <div class="workflow-panel__title">Milestones</div>
      <div class="milestone-list">
        ${milestones.map((milestone) => `
          <div class="milestone-card">
            <strong>${escapeHtml(milestone.title)}</strong>
            <p class="body-sm">${escapeHtml(milestone.summary)}</p>
            ${milestone.screenshotArtifactId ? `<img src="${escapeHtml(`${API_BASE}/task/${encodeURIComponent(task.meta.id)}/artifact/${encodeURIComponent(milestone.screenshotArtifactId)}`)}" alt="${escapeHtml(milestone.title)}" loading="lazy" />` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFinalOutputTab(task: NotebookTaskRecord, view: NotebookView): string {
  const finalSection = getSection(view, "final-output");
  const supportingSections = (view.sections || []).filter((section) => section.id !== "final-output");

  return `
    <div class="tab-panel">
      ${finalSection ? renderMarkdownPanel(finalSection.content) : emptyState({ message: "No final output yet", hint: "Task details and summary will appear here." })}
      ${supportingSections.length > 0 ? `
        <div class="workflow-panel">
          <div class="workflow-panel__title">Supporting Sections</div>
          ${sectionList({ sections: supportingSections })}
        </div>
      ` : ""}
      ${renderMilestones(task)}
      <div class="workflow-panel">
        <div class="workflow-panel__title">Timeline</div>
        ${timeline({ events: task.events || [] })}
      </div>
    </div>
  `;
}

function renderMainContent(task: NotebookTaskRecord | null): string {
  if (!task) {
    return `<div class="main-empty">${emptyState({ message: "Select a notebook to view", hint: "Pick one from the sidebar." })}</div>`;
  }

  const view = normalizeView(task.view);
  const header = taskHeader({
    taskId: task.meta.id,
    title: task.meta.title,
    summary: view.summary,
    status: task.meta.status,
    createdAt: task.meta.createdAt,
    updatedAt: task.meta.updatedAt,
    tags: task.meta.tags,
    deletable: !isShowcaseTask(task.meta.id),
  });
  return `
    ${header}
    <div class="content-body">
      ${renderFinalOutputTab(task, view)}
    </div>
  `;
}

function withShowcaseTask(tasks: NotebookTaskSummary[]): NotebookTaskSummary[] {
  return tasks.filter((task) => task.id !== SHOWCASE_TASK_ID);
}

function isShowcaseTask(taskId: string | null): boolean {
  return taskId === SHOWCASE_TASK_ID;
}

function resolveDefaultTaskId(tasks: NotebookTaskSummary[], selectedTaskId: string | null): string | null {
  if (selectedTaskId) return selectedTaskId;
  const firstRealTask = tasks.find((task) => task.id !== SHOWCASE_TASK_ID);
  return firstRealTask?.id ?? tasks[0]?.id ?? null;
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
      const taskTitle = button.dataset.deleteTaskTitle || "this notebook";
      if (!taskId || isShowcaseTask(taskId)) return;
      const confirmed = window.confirm(`Delete ${taskTitle}? This cannot be undone.`);
      if (!confirmed) return;
      try {
        const resp = await fetch(`${API_BASE}/task/${encodeURIComponent(taskId)}`, { method: "DELETE", credentials: "same-origin" });
        if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`);
        const url = new URL(window.location.href);
        if (url.searchParams.get("task") === taskId) {
          url.searchParams.delete("task");
        }
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
  const tasks = withShowcaseTask(await requestJson<NotebookTaskSummary[]>(`${API_BASE}/tasks`));
  const resolvedTaskId = resolveDefaultTaskId(tasks, selectedTaskId);

  let selectedTask: NotebookTaskRecord | null = null;
  if (resolvedTaskId) {
    if (isShowcaseTask(resolvedTaskId)) {
      selectedTask = createShowcaseTask();
    } else {
      try {
        selectedTask = await requestJson<NotebookTaskRecord>(
          `${API_BASE}/task/${encodeURIComponent(resolvedTaskId)}?events=1`,
        );
      } catch (e) {
        console.error("Failed to load task", e);
      }
    }
  }

  render({ tasks, selectedTaskId: resolvedTaskId, selectedTask });
}

void load().catch((error) => {
  if (appEl) {
    appEl.innerHTML = `<pre style="padding:2rem;color:#8a2820">${escapeHtml(error instanceof Error ? error.message : String(error))}</pre>`;
  }
});
