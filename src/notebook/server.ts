import { createServer, type IncomingMessage, type ServerResponse } from "http";
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
}

const serverStates = new Map<string, NotebookServerState>();

function getStateKey(appPaths: AppPaths, repoPaths: RepoPaths): string {
  return `${appPaths.dataDir}::${repoPaths.distDir}`;
}

function getState(appPaths: AppPaths, repoPaths: RepoPaths): NotebookServerState {
  const key = getStateKey(appPaths, repoPaths);
  let state = serverStates.get(key);
  if (!state) {
    state = {
      server: null,
      port: null,
      readyPromise: null,
    };
    serverStates.set(key, state);
  }
  return state;
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
  params: { appPaths: AppPaths; repoPaths: RepoPaths; port: number },
): Promise<void> {
  const url = new URL(req.url || "/", `http://127.0.0.1:${params.port}`);

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
  const state = getState(params.appPaths, params.repoPaths);
  if (state.port !== null) {
    return state.port;
  }

  if (state.readyPromise) {
    return state.readyPromise;
  }

  state.readyPromise = new Promise<number>((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : 0;
      notebookApiHandler(req, res, { ...params, port }).catch((error) => {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(error instanceof Error ? error.message : String(error));
      });
    });

    server.once("error", (error) => {
      state.readyPromise = null;
      rejectPromise(error);
    });

    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        state.readyPromise = null;
        rejectPromise(new Error("Notebook server did not expose a TCP port."));
        return;
      }
      state.server = server;
      state.port = address.port;
      resolvePromise(address.port);
    });

    server.listen(0, "127.0.0.1");
  });

  return state.readyPromise;
}

export async function getNotebookUrl(params: {
  appPaths: AppPaths;
  repoPaths: RepoPaths;
  taskId?: string;
}): Promise<string> {
  const port = await ensureNotebookServer(params);
  return params.taskId
    ? `http://127.0.0.1:${port}/notebook.html?task=${encodeURIComponent(params.taskId)}`
    : `http://127.0.0.1:${port}/notebook.html`;
}
