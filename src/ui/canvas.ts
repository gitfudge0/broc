/**
 * Broc Canvas UI -- entry point.
 *
 * Fetches canvas data from the local API and renders the full UI
 * using the component library. No framework -- just vanilla TS
 * composing (props) => string component functions.
 */

import { escapeHtml } from "./utils";

// -- Theme ------------------------------------------------------------------
import { themeCSS } from "./theme";

// -- Components -------------------------------------------------------------
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

// ---------------------------------------------------------------------------
//  Types (mirror the API shapes)
// ---------------------------------------------------------------------------
type CanvasTaskStatus = "pending" | "running" | "waiting" | "blocked" | "completed" | "failed" | "archived";

interface CanvasTaskSummary {
  id: string;
  title: string;
  status: CanvasTaskStatus;
  updatedAt: string;
  createdAt: string;
  tags?: string[];
  summary?: string;
}

interface CanvasTaskRecord {
  meta: {
    id: string;
    title: string;
    status: CanvasTaskStatus;
    updatedAt: string;
    createdAt: string;
    tags?: string[];
    artifacts: Array<{ id: string; name: string; kind: string; mimeType?: string; size: number; createdAt: string }>;
  };
  agentView: Record<string, unknown>;
  userView: {
    summary?: string;
    sections?: Array<{ id: string; title: string; kind: string; content: unknown }>;
    highlights?: Array<{ id: string; label: string; value: string }>;
    suggestedActions?: Array<{ id: string; label: string; kind: string; payload?: Record<string, unknown> }>;
  };
  events?: Array<{ id: string; type: string; createdAt: string; actor: string; payload: Record<string, unknown> }>;
}

interface CanvasPayload {
  tasks: CanvasTaskSummary[];
  selectedTask: CanvasTaskRecord | null;
  selectedTaskId: string | null;
}

// ---------------------------------------------------------------------------
//  API
// ---------------------------------------------------------------------------
const API_BASE = `${window.location.origin}/canvas-api`;

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
//  Collected stylesheet
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
//  Main content area
// ---------------------------------------------------------------------------

const mainContentCSS = /* css */ `
.main-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
}

.content-body {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--sp-7);
}

.content-body__left {
  display: flex;
  flex-direction: column;
  gap: var(--sp-7);
}

.content-body__right {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

.content-body__right-header {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  padding-bottom: var(--sp-3);
  border-bottom: 1px solid var(--border);
}

@media (max-width: 900px) {
  .content-body {
    grid-template-columns: 1fr;
  }
}
`;

function renderMainContent(task: CanvasTaskRecord | null): string {
  if (!task) {
    return `<div class="main-empty">${emptyState({ message: "Select a task to view its canvas", hint: "Pick one from the sidebar." })}</div>`;
  }

  // Task header (hero)
  const header = taskHeader({
    title: task.meta.title,
    summary: task.userView.summary,
    status: task.meta.status,
    createdAt: task.meta.createdAt,
    updatedAt: task.meta.updatedAt,
    tags: task.meta.tags,
  });

  // Highlight strip
  const highlights = highlightStrip({ items: task.userView.highlights || [] });

  // Sections (left column)
  const sections = sectionList({ sections: task.userView.sections || [] });

  // Artifact gallery (left column, below sections)
  const artifacts = artifactGallery({
    artifacts: task.meta.artifacts,
    taskId: task.meta.id,
    apiBase: API_BASE,
  });

  // Timeline (right column)
  const tl = timeline({ events: task.events || [] });

  return `
    ${header}
    ${highlights}
    <div class="content-body">
      <div class="content-body__left">
        ${sections}
        ${task.meta.artifacts.length > 0 ? artifacts : ""}
      </div>
      <div class="content-body__right">
        <div class="content-body__right-header">Timeline</div>
        ${tl}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
//  Interactions
// ---------------------------------------------------------------------------
function bindInteractions(): void {
  // Task list navigation
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
}

// ---------------------------------------------------------------------------
//  Render
// ---------------------------------------------------------------------------
const appEl = document.getElementById("app");

function render(payload: CanvasPayload): void {
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

  bindInteractions();
  bindThemeToggle();
}

// ---------------------------------------------------------------------------
//  Load
// ---------------------------------------------------------------------------
async function load(): Promise<void> {
  const search = new URLSearchParams(window.location.search);
  const selectedTaskId = search.get("task");
  const tasks = await requestJson<CanvasTaskSummary[]>(`${API_BASE}/tasks`);
  const resolvedTaskId = selectedTaskId || tasks[0]?.id || null;

  let selectedTask: CanvasTaskRecord | null = null;
  if (resolvedTaskId) {
    try {
      selectedTask = await requestJson<CanvasTaskRecord>(
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
