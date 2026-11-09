import { createServer, type ServerResponse } from "http";
import { readFile } from "fs/promises";
import { resolve } from "path";
import type { AppPaths, RepoPaths } from "../cli/paths.js";
import {
  deleteNotebookTask,
  listNotebookTasks,
  loadNotebookTask,
  markNotebookViewed,
  readNotebookArtifact,
} from "./store.js";

interface NotebookServerState {
  server: ReturnType<typeof createServer> | null;
  port: number | null;
  readyPromise: Promise<number> | null;
  hooks?: NotebookServerHooks;
}

interface NotebookServerParams {
  appPaths: AppPaths;
  repoPaths: RepoPaths;
}

interface NotebookServerListenOptions extends NotebookServerParams {
  host?: string;
  port?: number;
  stateKey?: string;
}

interface NotebookServerHooks {
}

const serverStates = new Map<string, NotebookServerState>();
const DEFAULT_NOTEBOOK_HOST = "127.0.0.1";

function getStateKey(appPaths: AppPaths, repoPaths: RepoPaths, stateKey = "default"): string {
  return `${appPaths.dataDir}::${repoPaths.distDir}::${stateKey}`;
}

function getState(appPaths: AppPaths, repoPaths: RepoPaths, stateKey?: string): NotebookServerState {
  const key = getStateKey(appPaths, repoPaths, stateKey);
  let state = serverStates.get(key);
  if (!state) {
    state = {
      server: null,
      port: null,
      readyPromise: null,
      hooks: undefined,
    };
    serverStates.set(key, state);
  }
  return state;
}

export function registerNotebookServerHooks(
  params: { appPaths: AppPaths; repoPaths: RepoPaths; stateKey?: string },
  hooks: NotebookServerHooks,
): void {
  const state = getState(params.appPaths, params.repoPaths, params.stateKey);
  state.hooks = hooks;
}

function buildNotebookUrl(port: number, taskId?: string, host = DEFAULT_NOTEBOOK_HOST): string {
  return taskId
    ? `http://${host}:${port}/notebook.html?task=${encodeURIComponent(taskId)}`
    : `http://${host}:${port}/notebook.html`;
}

function okJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

async function notebookApiHandler(
  req: IncomingMessage,
  res: ServerResponse,
  params: { appPaths: AppPaths; repoPaths: RepoPaths; port: number; hooks?: NotebookServerHooks },
): Promise<void> {
  const url = new URL(req.url || "/", `http://127.0.0.1:${params.port}`);

  if (req.method === "POST") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  if (req.method === "DELETE") {
    const deleteMatch = url.pathname.match(/^\/notebook-api\/task\/([^/]+)$/);
    if (deleteMatch) {
      const taskId = decodeURIComponent(deleteMatch[1]);
      try {
        await deleteNotebookTask(params.appPaths, taskId);
        okJson(res, { ok: true });
      } catch (err) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Not found" }));
      }
      return;
    }
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  if (url.pathname === "/notebook-api/tasks") {
    okJson(res, await listNotebookTasks(params.appPaths));
    return;
  }

  const taskMatch = url.pathname.match(/^\/notebook-api\/task\/([^/]+)$/);
  if (taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    const task = await loadNotebookTask(params.appPaths, taskId, { includeEvents: url.searchParams.get("events") === "1" });
    await markNotebookViewed(params.appPaths, taskId);
    okJson(res, task);
    return;
  }

  const artifactMatch = url.pathname.match(/^\/notebook-api\/task\/([^/]+)\/artifact\/([^/]+)$/);
  if (artifactMatch) {
    const taskId = decodeURIComponent(artifactMatch[1]);
    const artifactId = decodeURIComponent(artifactMatch[2]);
    const artifact = await readNotebookArtifact(params.appPaths, taskId, artifactId);
    if (!artifact) {
      notFound(res);
      return;
    }
    if (artifact.textContent !== undefined) {
      res.writeHead(200, { "content-type": artifact.artifact.mimeType || "text/plain; charset=utf-8" });
      res.end(artifact.textContent);
      return;
    }
    res.writeHead(200, { "content-type": artifact.artifact.mimeType || "application/octet-stream" });
    res.end(Buffer.from(artifact.base64Content || "", "base64"));
    return;
  }

  if (url.pathname === "/" || url.pathname === "/notebook.html") {
    const html = await readFile(resolve(params.repoPaths.distDir, "ui", "notebook.html"), "utf-8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (url.pathname === "/notebook.js") {
    const js = await readFile(resolve(params.repoPaths.distDir, "ui", "notebook.js"));
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(js);
    return;
  }

  notFound(res);
}

export async function ensureNotebookServer(params: { appPaths: AppPaths; repoPaths: RepoPaths }): Promise<number> {
  const { port } = await startNotebookServer({ ...params, stateKey: "embedded" });
  return port;
}

export async function startNotebookServer(params: NotebookServerListenOptions): Promise<{
  port: number;
  server: ReturnType<typeof createServer>;
}> {
  const host = params.host ?? DEFAULT_NOTEBOOK_HOST;
  const listenPort = params.port ?? 0;
  const stateKey = params.stateKey ?? `${host}:${listenPort || "ephemeral"}`;
  const state = getState(params.appPaths, params.repoPaths, stateKey);
  if (state.port !== null) {
    if (!state.server) {
      throw new Error("Notebook server state is inconsistent.");
    }
    return { port: state.port, server: state.server };
  }

  if (state.readyPromise) {
    const port = await state.readyPromise;
    if (!state.server) {
      throw new Error("Notebook server did not initialize correctly.");
    }
    return { port, server: state.server };
  }

  state.readyPromise = new Promise<number>((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : 0;
      notebookApiHandler(req, res, { ...params, port, hooks: state.hooks }).catch((error) => {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(error instanceof Error ? error.message : String(error));
      });
    });

    server.once("error", (error) => {
      state.server = null;
      state.port = null;
      state.readyPromise = null;
      rejectPromise(error);
    });

    server.once("close", () => {
      state.server = null;
      state.port = null;
      state.readyPromise = null;
    });

    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        state.server = null;
        state.port = null;
        state.readyPromise = null;
        rejectPromise(new Error("Notebook server did not expose a TCP port."));
        return;
      }
      state.server = server;
      state.port = address.port;
      resolvePromise(address.port);
    });

    server.listen(listenPort, host);
  });

  const port = await state.readyPromise;
  if (!state.server) {
    throw new Error("Notebook server did not initialize correctly.");
  }
  return { port, server: state.server };
}

export async function closeNotebookServer(params: NotebookServerListenOptions): Promise<void> {
  const host = params.host ?? DEFAULT_NOTEBOOK_HOST;
  const listenPort = params.port ?? 0;
  const stateKey = params.stateKey ?? `${host}:${listenPort || "ephemeral"}`;
  const state = getState(params.appPaths, params.repoPaths, stateKey);
  if (!state.server) {
    return;
  }

  const server = state.server;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise();
    });
  });
}

export async function getNotebookUrl(params: {
  appPaths: AppPaths;
  repoPaths: RepoPaths;
  taskId?: string;
}): Promise<string> {
  const port = await ensureNotebookServer(params);
  return buildNotebookUrl(port, params.taskId);
}

export function getStandaloneNotebookUrl(params: {
  port: number;
  taskId?: string;
  host?: string;
}): string {
  return buildNotebookUrl(params.port, params.taskId, params.host);
}
