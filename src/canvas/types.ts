export type CanvasTaskStatus =
  | "pending"
  | "running"
  | "waiting"
  | "blocked"
  | "completed"
  | "failed"
  | "archived";

export type CanvasActor = "agent" | "system" | "user";

export type CanvasSectionKind = "text" | "list" | "timeline" | "table" | "artifact-gallery" | "html";

export type CanvasSuggestedActionKind = "open_url" | "focus_tab" | "view_artifact" | "dismiss";

export type CanvasEventType =
  | "task.created"
  | "task.updated"
  | "task.status_changed"
  | "agent.note_added"
  | "agent.plan_set"
  | "agent.view_updated"
  | "user.summary_set"
  | "user.section_upserted"
  | "user.view_updated"
  | "artifact.added"
  | "browser.snapshot_linked"
  | "browser.event_linked";

export interface CanvasPlanStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done" | "cancelled";
}

export interface CanvasNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface CanvasCheckpoint {
  id: string;
  label: string;
  data?: unknown;
  createdAt: string;
}

export interface CanvasSection {
  id: string;
  title: string;
  kind: CanvasSectionKind;
  content: unknown;
}

export interface CanvasSuggestedAction {
  id: string;
  label: string;
  kind: CanvasSuggestedActionKind;
  payload?: Record<string, unknown>;
}

export interface CanvasHighlight {
  id: string;
  label: string;
  value: string;
}

export interface AgentView {
  goal?: string;
  plan?: CanvasPlanStep[];
  notes?: CanvasNote[];
  checkpoints?: CanvasCheckpoint[];
  state?: Record<string, unknown>;
}

export interface UserView {
  summary?: string;
  sections?: CanvasSection[];
  suggestedActions?: CanvasSuggestedAction[];
  highlights?: CanvasHighlight[];
}

export interface CanvasArtifact {
  id: string;
  name: string;
  kind: string;
  mimeType?: string;
  fileName: string;
  relativePath: string;
  createdAt: string;
  size: number;
}

export interface CanvasTaskMeta {
  id: string;
  title: string;
  status: CanvasTaskStatus;
  createdAt: string;
  updatedAt: string;
  lastViewedAt?: string;
  tags?: string[];
  sessionId?: string;
  tabId?: number;
  archivedAt?: string;
  artifacts: CanvasArtifact[];
}

export interface CanvasTaskSummary {
  id: string;
  title: string;
  status: CanvasTaskStatus;
  updatedAt: string;
  createdAt: string;
  tags?: string[];
  summary?: string;
}

export interface CanvasTaskRecord {
  meta: CanvasTaskMeta;
  agentView: AgentView;
  userView: UserView;
  events?: CanvasEvent[];
}

export interface CanvasEvent {
  id: string;
  taskId: string;
  type: CanvasEventType | string;
  createdAt: string;
  actor: CanvasActor;
  payload: Record<string, unknown>;
}

export interface CanvasCreateInput {
  id?: string;
  title: string;
  goal?: string;
  tags?: string[];
  sessionId?: string;
  tabId?: number;
}

export interface CanvasMetaUpdate {
  title?: string;
  status?: CanvasTaskStatus;
  tags?: string[];
  sessionId?: string;
  tabId?: number;
}

export interface CanvasViewUpdate<T> {
  merge?: boolean;
  value: T;
}

export interface CanvasAppendEventInput {
  type: CanvasEventType | string;
  actor?: CanvasActor;
  payload?: Record<string, unknown>;
}

export interface CanvasArtifactInput {
  kind: string;
  name: string;
  mimeType?: string;
  extension?: string;
  sourcePath?: string;
  textContent?: string;
  base64Content?: string;
}

export interface CanvasArtifactContent {
  artifact: CanvasArtifact;
  textContent?: string;
  base64Content?: string;
}

export interface CanvasIndex {
  schemaVersion: number;
  updatedAt: string;
  tasks: CanvasTaskSummary[];
}
