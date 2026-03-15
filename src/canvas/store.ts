import { mkdir, readFile, readdir, stat, writeFile, copyFile } from "fs/promises";
import { extname, resolve } from "path";
import { randomUUID } from "crypto";
import type { AppPaths } from "../cli/paths.js";
import type {
  AgentView,
  CanvasAppendEventInput,
  CanvasArtifact,
  CanvasArtifactContent,
  CanvasArtifactInput,
  CanvasCreateInput,
  CanvasEvent,
  CanvasIndex,
  CanvasMetaUpdate,
  CanvasTaskMeta,
  CanvasTaskRecord,
  CanvasTaskSummary,
  CanvasViewUpdate,
  UserView,
} from "./types.js";

const SCHEMA_VERSION = 1;

interface TaskPaths {
  taskDir: string;
  metaPath: string;
  agentViewPath: string;
  userViewPath: string;
  eventsPath: string;
  artifactsDir: string;
}

function canvasRoot(appPaths: AppPaths): string {
  return resolve(appPaths.dataDir, "canvases");
}

function tasksRoot(appPaths: AppPaths): string {
  return resolve(canvasRoot(appPaths), "tasks");
}

function indexPath(appPaths: AppPaths): string {
  return resolve(canvasRoot(appPaths), "index.json");
}

function taskPaths(appPaths: AppPaths, taskId: string): TaskPaths {
  const taskDir = resolve(tasksRoot(appPaths), taskId);
  return {
    taskDir,
    metaPath: resolve(taskDir, "meta.json"),
    agentViewPath: resolve(taskDir, "agent-view.json"),
    userViewPath: resolve(taskDir, "user-view.json"),
    eventsPath: resolve(taskDir, "events.ndjson"),
    artifactsDir: resolve(taskDir, "artifacts"),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function sanitizeTaskId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSummary(meta: CanvasTaskMeta, userView: UserView): CanvasTaskSummary {
  return {
    id: meta.id,
    title: meta.title,
    status: meta.status,
    updatedAt: meta.updatedAt,
    createdAt: meta.createdAt,
    tags: meta.tags,
    summary: userView.summary,
  };
}

function mergeRecord<T extends Record<string, unknown>>(current: T, incoming: T): T {
  return { ...current, ...incoming };
}

function defaultMeta(input: CanvasCreateInput): CanvasTaskMeta {
  const timestamp = nowIso();
  return {
    id: sanitizeTaskId(input.id ?? randomUUID()),
    title: input.title,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: input.tags,
    sessionId: input.sessionId,
    tabId: input.tabId,
    artifacts: [],
  };
}

function defaultAgentView(input: CanvasCreateInput): AgentView {
  return input.goal ? { goal: input.goal } : {};
}

function defaultUserView(input: CanvasCreateInput): UserView {
  return input.goal ? { summary: input.goal } : {};
}

async function loadIndex(appPaths: AppPaths): Promise<CanvasIndex> {
  return readJson(indexPath(appPaths), {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    tasks: [],
  } satisfies CanvasIndex);
}

async function saveIndex(appPaths: AppPaths, index: CanvasIndex): Promise<void> {
  index.updatedAt = nowIso();
  await writeJson(indexPath(appPaths), index);
}

export async function ensureCanvasStore(appPaths: AppPaths): Promise<void> {
  await ensureDir(canvasRoot(appPaths));
  await ensureDir(tasksRoot(appPaths));
  const idxPath = indexPath(appPaths);
  if (!await pathExists(idxPath)) {
    await saveIndex(appPaths, {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: nowIso(),
      tasks: [],
    });
  }
}

export async function createCanvasTask(appPaths: AppPaths, input: CanvasCreateInput): Promise<CanvasTaskRecord> {
  await ensureCanvasStore(appPaths);
  const meta = defaultMeta(input);
  const paths = taskPaths(appPaths, meta.id);

  if (await pathExists(paths.taskDir)) {
    throw new Error(`Canvas task already exists: ${meta.id}`);
  }

  await ensureDir(paths.artifactsDir);
  const agentView = defaultAgentView(input);
  const userView = defaultUserView(input);
  await writeJson(paths.metaPath, meta);
  await writeJson(paths.agentViewPath, agentView);
  await writeJson(paths.userViewPath, userView);
  await writeFile(paths.eventsPath, "", "utf-8");

  const created = await appendCanvasEvent(appPaths, meta.id, {
    type: "task.created",
    actor: "system",
    payload: { title: meta.title, goal: input.goal, tags: input.tags },
  });

  const index = await loadIndex(appPaths);
  index.tasks = [toSummary(meta, userView), ...index.tasks.filter((task) => task.id !== meta.id)];
  await saveIndex(appPaths, index);

  return { meta, agentView, userView, events: [created] };
}

export async function listCanvasTasks(appPaths: AppPaths): Promise<CanvasTaskSummary[]> {
  await ensureCanvasStore(appPaths);
  const index = await loadIndex(appPaths);
  return [...index.tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function loadTaskMeta(appPaths: AppPaths, taskId: string): Promise<CanvasTaskMeta> {
  const meta = await readJson<CanvasTaskMeta | null>(taskPaths(appPaths, taskId).metaPath, null);
  if (!meta) {
    throw new Error(`Canvas task not found: ${taskId}`);
  }
  return meta;
}

export async function loadCanvasTask(
  appPaths: AppPaths,
  taskId: string,
  options: { includeEvents?: boolean } = {},
): Promise<CanvasTaskRecord> {
  await ensureCanvasStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  const [agentView, userView] = await Promise.all([
    readJson<AgentView>(paths.agentViewPath, {}),
    readJson<UserView>(paths.userViewPath, {}),
  ]);
  const events = options.includeEvents ? await readCanvasEvents(appPaths, taskId) : undefined;
  return { meta, agentView, userView, events };
}

async function updateIndexEntry(appPaths: AppPaths, meta: CanvasTaskMeta, userView: UserView): Promise<void> {
  const index = await loadIndex(appPaths);
  const summary = toSummary(meta, userView);
  index.tasks = [summary, ...index.tasks.filter((task) => task.id !== meta.id)];
  await saveIndex(appPaths, index);
}

async function touchTask(appPaths: AppPaths, taskId: string): Promise<CanvasTaskMeta> {
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  const nextMeta = { ...meta, updatedAt: nowIso() };
  await writeJson(paths.metaPath, nextMeta);
  const userView = await readJson<UserView>(paths.userViewPath, {});
  await updateIndexEntry(appPaths, nextMeta, userView);
  return nextMeta;
}

export async function updateCanvasMeta(appPaths: AppPaths, taskId: string, update: CanvasMetaUpdate): Promise<CanvasTaskMeta> {
  await ensureCanvasStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  const nextMeta: CanvasTaskMeta = {
    ...meta,
    ...update,
    updatedAt: nowIso(),
    archivedAt: update.status === "archived" ? (meta.archivedAt ?? nowIso()) : meta.archivedAt,
  };
  await writeJson(paths.metaPath, nextMeta);
  const userView = await readJson<UserView>(paths.userViewPath, {});
  await updateIndexEntry(appPaths, nextMeta, userView);
  await appendCanvasEvent(appPaths, taskId, {
    type: update.status && update.status !== meta.status ? "task.status_changed" : "task.updated",
    actor: "system",
    payload: update as Record<string, unknown>,
  });
  return nextMeta;
}

export async function setCanvasAgentView(
  appPaths: AppPaths,
  taskId: string,
  update: CanvasViewUpdate<AgentView>,
): Promise<AgentView> {
  await ensureCanvasStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  await loadTaskMeta(appPaths, taskId);
  const current = await readJson<AgentView>(paths.agentViewPath, {});
  const next = update.merge
    ? mergeRecord(current as Record<string, unknown>, update.value as Record<string, unknown>) as AgentView
    : update.value;
  await writeJson(paths.agentViewPath, next);
  await touchTask(appPaths, taskId);
  await appendCanvasEvent(appPaths, taskId, {
    type: "agent.view_updated",
    actor: "agent",
    payload: { merge: !!update.merge },
  });
  return next;
}

export async function setCanvasUserView(
  appPaths: AppPaths,
  taskId: string,
  update: CanvasViewUpdate<UserView>,
): Promise<UserView> {
  await ensureCanvasStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  await loadTaskMeta(appPaths, taskId);
  const current = await readJson<UserView>(paths.userViewPath, {});
  const next = update.merge
    ? mergeRecord(current as Record<string, unknown>, update.value as Record<string, unknown>) as UserView
    : update.value;
  await writeJson(paths.userViewPath, next);
  const refreshedMeta = await touchTask(appPaths, taskId);
  await updateIndexEntry(appPaths, refreshedMeta, next);
  await appendCanvasEvent(appPaths, taskId, {
    type: "user.view_updated",
    actor: "agent",
    payload: { merge: !!update.merge },
  });
  return next;
}

export async function appendCanvasEvent(appPaths: AppPaths, taskId: string, input: CanvasAppendEventInput): Promise<CanvasEvent> {
  await ensureCanvasStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  await loadTaskMeta(appPaths, taskId);
  const event: CanvasEvent = {
    id: randomUUID(),
    taskId,
    type: input.type,
    createdAt: nowIso(),
    actor: input.actor ?? "system",
    payload: input.payload ?? {},
  };
  await writeFile(paths.eventsPath, JSON.stringify(event) + "\n", { encoding: "utf-8", flag: "a" });
  await touchTask(appPaths, taskId);
  return event;
}

export async function readCanvasEvents(appPaths: AppPaths, taskId: string): Promise<CanvasEvent[]> {
  const paths = taskPaths(appPaths, taskId);
  try {
    const raw = await readFile(paths.eventsPath, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CanvasEvent)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function addCanvasArtifact(appPaths: AppPaths, taskId: string, input: CanvasArtifactInput): Promise<CanvasArtifact> {
  await ensureCanvasStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  await ensureDir(paths.artifactsDir);

  const artifactId = randomUUID();
  const extension = input.extension || extname(input.sourcePath || input.name || "") || ".bin";
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const fileName = `${artifactId}${safeExtension}`;
  const destination = resolve(paths.artifactsDir, fileName);

  let size = 0;
  if (input.sourcePath) {
    await copyFile(input.sourcePath, destination);
    size = (await stat(destination)).size;
  } else if (input.textContent !== undefined) {
    await writeFile(destination, input.textContent, "utf-8");
    size = Buffer.byteLength(input.textContent, "utf-8");
  } else if (input.base64Content) {
    const decoded = Buffer.from(input.base64Content, "base64");
    await writeFile(destination, decoded);
    size = decoded.length;
  } else {
    throw new Error("Artifact requires sourcePath, textContent, or base64Content.");
  }

  const artifact: CanvasArtifact = {
    id: artifactId,
    name: input.name,
    kind: input.kind,
    mimeType: input.mimeType,
    fileName,
    relativePath: `artifacts/${fileName}`,
    createdAt: nowIso(),
    size,
  };

  meta.artifacts = [artifact, ...meta.artifacts];
  meta.updatedAt = nowIso();
  await writeJson(paths.metaPath, meta);
  const userView = await readJson<UserView>(paths.userViewPath, {});
  await updateIndexEntry(appPaths, meta, userView);
  await appendCanvasEvent(appPaths, taskId, {
    type: "artifact.added",
    actor: "agent",
    payload: artifact as unknown as Record<string, unknown>,
  });
  return artifact;
}

export async function readCanvasArtifact(
  appPaths: AppPaths,
  taskId: string,
  artifactId: string,
): Promise<CanvasArtifactContent | null> {
  const record = await loadCanvasTask(appPaths, taskId);
  const artifact = record.meta.artifacts.find((item) => item.id === artifactId);
  if (!artifact) return null;

  const absolutePath = resolve(taskPaths(appPaths, taskId).taskDir, artifact.relativePath);
  const raw = await readFile(absolutePath);
  const isText = artifact.mimeType?.startsWith("text/") || [".json", ".txt", ".md", ".html", ".csv"].includes(extname(artifact.fileName));
  return {
    artifact,
    textContent: isText ? raw.toString("utf-8") : undefined,
    base64Content: isText ? undefined : raw.toString("base64"),
  };
}

export async function markCanvasViewed(appPaths: AppPaths, taskId: string): Promise<CanvasTaskMeta> {
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  const next = { ...meta, lastViewedAt: nowIso(), updatedAt: nowIso() };
  await writeJson(paths.metaPath, next);
  const userView = await readJson<UserView>(paths.userViewPath, {});
  await updateIndexEntry(appPaths, next, userView);
  return next;
}

export async function listCanvasTaskIds(appPaths: AppPaths): Promise<string[]> {
  await ensureCanvasStore(appPaths);
  try {
    const entries = await readdir(tasksRoot(appPaths), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function findCanvasTaskBySessionId(appPaths: AppPaths, sessionId: string): Promise<CanvasTaskRecord | null> {
  const ids = await listCanvasTaskIds(appPaths);
  for (const taskId of ids) {
    const task = await loadCanvasTask(appPaths, taskId).catch(() => null);
    if (task?.meta.sessionId === sessionId) {
      return task;
    }
  }
  return null;
}
