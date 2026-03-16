import { mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from "fs/promises";
import { extname, resolve } from "path";
import { randomUUID } from "crypto";
import type { AppPaths } from "../cli/paths.js";
import type {
  NotebookAppendEventInput,
  NotebookArtifact,
  NotebookArtifactContent,
  NotebookArtifactInput,
  NotebookCreateInput,
  NotebookEvent,
  NotebookIndex,
  NotebookMetaUpdate,
  NotebookTaskMeta,
  NotebookTaskRecord,
  NotebookTaskSummary,
  NotebookView,
  NotebookViewUpdate,
} from "./types.js";

const SCHEMA_VERSION = 1;

interface TaskPaths {
  taskDir: string;
  metaPath: string;
  viewPath: string;
  eventsPath: string;
  artifactsDir: string;
}

function legacyCanvasRoot(appPaths: AppPaths): string {
  return resolve(appPaths.dataDir, "canvases");
}

function notebookRoot(appPaths: AppPaths): string {
  return resolve(appPaths.dataDir, "notebooks");
}

function tasksRoot(appPaths: AppPaths): string {
  return resolve(notebookRoot(appPaths), "tasks");
}

function indexPath(appPaths: AppPaths): string {
  return resolve(notebookRoot(appPaths), "index.json");
}

function taskPaths(appPaths: AppPaths, taskId: string): TaskPaths {
  const taskDir = resolve(tasksRoot(appPaths), taskId);
  return {
    taskDir,
    metaPath: resolve(taskDir, "meta.json"),
    viewPath: resolve(taskDir, "view.json"),
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

function resolveTaskId(input: NotebookCreateInput): string {
  return sanitizeTaskId(input.id ?? input.title ?? randomUUID());
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSummary(meta: NotebookTaskMeta, view: NotebookView): NotebookTaskSummary {
  return {
    id: meta.id,
    title: meta.title,
    status: meta.status,
    updatedAt: meta.updatedAt,
    createdAt: meta.createdAt,
    tags: meta.tags,
    summary: view.summary,
  };
}

function mergeRecord<T extends Record<string, unknown>>(current: T, incoming: T): T {
  return { ...current, ...incoming };
}

function defaultMeta(input: NotebookCreateInput): NotebookTaskMeta {
  const timestamp = nowIso();
  return {
    id: resolveTaskId(input),
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

function defaultView(input: NotebookCreateInput): NotebookView {
  return input.goal ? { summary: input.goal } : {};
}

async function deleteLegacyCanvasData(appPaths: AppPaths): Promise<void> {
  const legacyRoot = legacyCanvasRoot(appPaths);
  if (await pathExists(legacyRoot)) {
    await rm(legacyRoot, { recursive: true, force: true });
  }
}

async function loadIndex(appPaths: AppPaths): Promise<NotebookIndex> {
  return readJson(indexPath(appPaths), {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    tasks: [],
  } satisfies NotebookIndex);
}

async function saveIndex(appPaths: AppPaths, index: NotebookIndex): Promise<void> {
  index.updatedAt = nowIso();
  await writeJson(indexPath(appPaths), index);
}

export async function ensureNotebookStore(appPaths: AppPaths): Promise<void> {
  await deleteLegacyCanvasData(appPaths);
  await ensureDir(notebookRoot(appPaths));
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

export async function createNotebookTask(appPaths: AppPaths, input: NotebookCreateInput): Promise<NotebookTaskRecord> {
  await ensureNotebookStore(appPaths);
  const taskId = resolveTaskId(input);
  const paths = taskPaths(appPaths, taskId);

  if (await pathExists(paths.taskDir)) {
    await updateNotebookMeta(appPaths, taskId, {
      title: input.title,
      tags: input.tags,
      sessionId: input.sessionId,
      tabId: input.tabId,
    });
    return loadNotebookTask(appPaths, taskId, { includeEvents: true });
  }

  const meta = defaultMeta({ ...input, id: taskId });
  const view = defaultView(input);
  await ensureDir(paths.artifactsDir);
  await writeJson(paths.metaPath, meta);
  await writeJson(paths.viewPath, view);
  await writeFile(paths.eventsPath, "", "utf-8");

  const created = await appendNotebookEvent(appPaths, meta.id, {
    type: "task.created",
    actor: "system",
    payload: { title: meta.title, goal: input.goal, tags: input.tags },
  });

  const index = await loadIndex(appPaths);
  index.tasks = [toSummary(meta, view), ...index.tasks.filter((task) => task.id !== meta.id)];
  await saveIndex(appPaths, index);

  return { meta, view, events: [created] };
}

export async function listNotebookTasks(appPaths: AppPaths): Promise<NotebookTaskSummary[]> {
  await ensureNotebookStore(appPaths);
  const index = await loadIndex(appPaths);
  return [...index.tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function loadTaskMeta(appPaths: AppPaths, taskId: string): Promise<NotebookTaskMeta> {
  const meta = await readJson<NotebookTaskMeta | null>(taskPaths(appPaths, taskId).metaPath, null);
  if (!meta) {
    throw new Error(`Notebook task not found: ${taskId}`);
  }
  return meta;
}

export async function loadNotebookTask(
  appPaths: AppPaths,
  taskId: string,
  options: { includeEvents?: boolean } = {},
): Promise<NotebookTaskRecord> {
  await ensureNotebookStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  const view = await readJson<NotebookView>(paths.viewPath, {});
  const events = options.includeEvents ? await readNotebookEvents(appPaths, taskId) : undefined;
  return { meta, view, events };
}

async function updateIndexEntry(appPaths: AppPaths, meta: NotebookTaskMeta, view: NotebookView): Promise<void> {
  const index = await loadIndex(appPaths);
  const summary = toSummary(meta, view);
  index.tasks = [summary, ...index.tasks.filter((task) => task.id !== meta.id)];
  await saveIndex(appPaths, index);
}

async function touchTask(appPaths: AppPaths, taskId: string): Promise<NotebookTaskMeta> {
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  const nextMeta = { ...meta, updatedAt: nowIso() };
  await writeJson(paths.metaPath, nextMeta);
  const view = await readJson<NotebookView>(paths.viewPath, {});
  await updateIndexEntry(appPaths, nextMeta, view);
  return nextMeta;
}

export async function updateNotebookMeta(appPaths: AppPaths, taskId: string, update: NotebookMetaUpdate): Promise<NotebookTaskMeta> {
  await ensureNotebookStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  const nextMeta: NotebookTaskMeta = {
    ...meta,
    ...update,
    updatedAt: nowIso(),
    archivedAt: update.status === "archived" ? (meta.archivedAt ?? nowIso()) : meta.archivedAt,
  };
  await writeJson(paths.metaPath, nextMeta);
  const view = await readJson<NotebookView>(paths.viewPath, {});
  await updateIndexEntry(appPaths, nextMeta, view);
  await appendNotebookEvent(appPaths, taskId, {
    type: update.status && update.status !== meta.status ? "task.status_changed" : "task.updated",
    actor: "system",
    payload: update as Record<string, unknown>,
  });
  return nextMeta;
}

export async function setNotebookView(
  appPaths: AppPaths,
  taskId: string,
  update: NotebookViewUpdate<NotebookView>,
): Promise<NotebookView> {
  await ensureNotebookStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  await loadTaskMeta(appPaths, taskId);
  const current = await readJson<NotebookView>(paths.viewPath, {});
  const next = update.merge
    ? mergeRecord(current as Record<string, unknown>, update.value as Record<string, unknown>) as NotebookView
    : update.value;
  await writeJson(paths.viewPath, next);
  const refreshedMeta = await touchTask(appPaths, taskId);
  await updateIndexEntry(appPaths, refreshedMeta, next);
  await appendNotebookEvent(appPaths, taskId, {
    type: "notebook.view_updated",
    actor: "agent",
    payload: { merge: !!update.merge },
  });
  return next;
}

export async function appendNotebookEvent(appPaths: AppPaths, taskId: string, input: NotebookAppendEventInput): Promise<NotebookEvent> {
  await ensureNotebookStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  await loadTaskMeta(appPaths, taskId);
  const event: NotebookEvent = {
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

export async function readNotebookEvents(appPaths: AppPaths, taskId: string): Promise<NotebookEvent[]> {
  const paths = taskPaths(appPaths, taskId);
  try {
    const raw = await readFile(paths.eventsPath, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as NotebookEvent)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function addNotebookArtifact(appPaths: AppPaths, taskId: string, input: NotebookArtifactInput): Promise<NotebookArtifact> {
  await ensureNotebookStore(appPaths);
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

  const artifact: NotebookArtifact = {
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
  const view = await readJson<NotebookView>(paths.viewPath, {});
  await updateIndexEntry(appPaths, meta, view);
  await appendNotebookEvent(appPaths, taskId, {
    type: "artifact.added",
    actor: "agent",
    payload: artifact as unknown as Record<string, unknown>,
  });
  return artifact;
}

export async function readNotebookArtifact(
  appPaths: AppPaths,
  taskId: string,
  artifactId: string,
): Promise<NotebookArtifactContent | null> {
  const record = await loadNotebookTask(appPaths, taskId);
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

export async function markNotebookViewed(appPaths: AppPaths, taskId: string): Promise<NotebookTaskMeta> {
  const paths = taskPaths(appPaths, taskId);
  const meta = await loadTaskMeta(appPaths, taskId);
  const next = { ...meta, lastViewedAt: nowIso() };
  await writeJson(paths.metaPath, next);
  const view = await readJson<NotebookView>(paths.viewPath, {});
  await updateIndexEntry(appPaths, next, view);
  return next;
}

export async function deleteNotebookTask(appPaths: AppPaths, taskId: string): Promise<void> {
  await ensureNotebookStore(appPaths);
  const paths = taskPaths(appPaths, taskId);
  if (!(await pathExists(paths.taskDir))) {
    throw new Error(`Notebook task not found: ${taskId}`);
  }
  await rm(paths.taskDir, { recursive: true, force: true });
  const index = await loadIndex(appPaths);
  index.tasks = index.tasks.filter((task) => task.id !== taskId);
  await saveIndex(appPaths, index);
}

export async function listNotebookTaskIds(appPaths: AppPaths): Promise<string[]> {
  await ensureNotebookStore(appPaths);
  try {
    const entries = await readdir(tasksRoot(appPaths), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function findNotebookTaskBySessionId(appPaths: AppPaths, sessionId: string): Promise<NotebookTaskRecord | null> {
  const ids = await listNotebookTaskIds(appPaths);
  for (const taskId of ids) {
    const task = await loadNotebookTask(appPaths, taskId).catch(() => null);
    if (task?.meta.sessionId === sessionId) {
      return task;
    }
  }
  return null;
}

export async function findNotebookTaskByTabId(appPaths: AppPaths, tabId: number): Promise<NotebookTaskRecord | null> {
  const ids = await listNotebookTaskIds(appPaths);
  for (const taskId of ids) {
    const task = await loadNotebookTask(appPaths, taskId).catch(() => null);
    if (task?.meta.tabId === tabId) {
      return task;
    }
  }
  return null;
}
