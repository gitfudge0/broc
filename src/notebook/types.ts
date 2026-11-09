export type NotebookTaskStatus =
  | "pending"
  | "running"
  | "waiting"
  | "blocked"
  | "completed"
  | "failed"
  | "archived";

export type NotebookActor = "agent" | "system" | "user";

export type NotebookPlanStepStatus = "pending" | "running" | "completed" | "blocked";

export interface NotebookPlanStep {
  id: string;
  label: string;
  status: NotebookPlanStepStatus;
}

export interface NotebookMilestone {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  screenshotArtifactId?: string;
}

export interface NotebookGatheredResult {
  id: string;
  label: string;
  value: string;
  source?: string;
  fields?: Record<string, string>;
  createdAt: string;
}

export interface NotebookFinalOutput {
  summary?: string;
  details?: string;
  gathered?: NotebookGatheredResult[];
  screenshotArtifactId?: string;
}

export type NotebookTabId = "final-output";

export interface NotebookPresentationSection {
  id: string;
  title: string;
  kind: NotebookSectionKind;
  tab?: NotebookTabId;
  content: unknown;
}

export interface NotebookPresentationState {
  summary?: string;
  highlights?: NotebookHighlight[];
  suggestedActions?: NotebookSuggestedAction[];
  customSections?: NotebookPresentationSection[];
}

export interface NotebookTaskWorkflow {
  task?: string;
  plan?: NotebookPlanStep[];
  currentStepId?: string;
  milestones?: NotebookMilestone[];
  gatheredResults?: NotebookGatheredResult[];
  finalOutput?: NotebookFinalOutput;
  presentation?: NotebookPresentationState;
}

export type NotebookSectionKind =
  | "text"
  | "markdown"
  | "key_value"
  | "list"
  | "table"
  | "code"
  | "json"
  | "diff"
  | "checklist"
  | "metrics"
  | "links"
  | "media"
  | "timeline"
  | "artifact_gallery"
  | "html";

export type NotebookSuggestedActionKind = "open_url" | "focus_tab" | "view_artifact" | "dismiss";

export type NotebookEventType =
  | "task.created"
  | "task.updated"
  | "task.status_changed"
  | "notebook.summary_set"
  | "notebook.section_upserted"
  | "notebook.view_updated"
  | "artifact.added"
  | "browser.snapshot_linked"
  | "browser.event_linked";

export interface NotebookSection {
  id: string;
  title: string;
  kind: NotebookSectionKind;
  tab?: NotebookTabId;
  content: unknown;
}

export interface NotebookSuggestedAction {
  id: string;
  label: string;
  kind: NotebookSuggestedActionKind;
  payload?: Record<string, unknown>;
}

export interface NotebookHighlight {
  id: string;
  label: string;
  value: string;
}

export interface NotebookView {
  summary?: string;
  sections?: NotebookSection[];
  suggestedActions?: NotebookSuggestedAction[];
  highlights?: NotebookHighlight[];
}

export interface NotebookArtifact {
  id: string;
  name: string;
  kind: string;
  mimeType?: string;
  fileName: string;
  relativePath: string;
  createdAt: string;
  size: number;
}

export interface NotebookTaskMeta {
  id: string;
  title: string;
  status: NotebookTaskStatus;
  createdAt: string;
  updatedAt: string;
  lastViewedAt?: string;
  tags?: string[];
  sessionId?: string;
  tabId?: number;
  archivedAt?: string;
  artifacts: NotebookArtifact[];
}

export interface NotebookTaskSummary {
  id: string;
  title: string;
  status: NotebookTaskStatus;
  updatedAt: string;
  createdAt: string;
  tags?: string[];
  summary?: string;
}

export interface NotebookTaskRecord {
  meta: NotebookTaskMeta;
  view: NotebookView;
  workflow: NotebookTaskWorkflow;
  events?: NotebookEvent[];
}

export interface NotebookEvent {
  id: string;
  taskId: string;
  type: NotebookEventType | string;
  createdAt: string;
  actor: NotebookActor;
  payload: Record<string, unknown>;
}

export interface NotebookCreateInput {
  id?: string;
  title: string;
  goal?: string;
  tags?: string[];
  sessionId?: string;
  tabId?: number;
  task?: string;
  plan?: NotebookPlanStep[];
}

export interface NotebookMetaUpdate {
  title?: string;
  status?: NotebookTaskStatus;
  tags?: string[];
  sessionId?: string;
  tabId?: number;
}

export interface NotebookViewUpdate<T> {
  merge?: boolean;
  value: T;
}

export interface NotebookAppendEventInput {
  type: NotebookEventType | string;
  actor?: NotebookActor;
  payload?: Record<string, unknown>;
}

export interface NotebookArtifactInput {
  kind: string;
  name: string;
  mimeType?: string;
  extension?: string;
  sourcePath?: string;
  textContent?: string;
  base64Content?: string;
}

export interface NotebookArtifactContent {
  artifact: NotebookArtifact;
  textContent?: string;
  base64Content?: string;
}

export interface NotebookIndex {
  schemaVersion: number;
  updatedAt: string;
  tasks: NotebookTaskSummary[];
}
