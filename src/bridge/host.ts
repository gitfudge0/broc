// ============================================================
// Native messaging bridge — host process
//
// This process is launched by the browser extension via the native
// messaging protocol. It acts as a relay between the extension and
// the MCP server (or CLI):
//
//   Extension  ←─ native messaging (stdin/stdout) ─→  Bridge Host
//                                                           │
//                                              Unix socket (IPC)
//                                                           │
//                                              MCP Server / CLI
//
// stdin/stdout is EXCLUSIVELY the native messaging channel.
// MCP server and CLI connect via a Unix socket.
//
// Socket path: /tmp/broc-<uid>.sock
// PID file:    /tmp/broc-<uid>.pid
// ============================================================

import { createServer, createConnection, type Server, type Socket } from "net";
import { createNodeLogger } from "../shared/logger.js";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { userInfo } from "os";

const log = createNodeLogger("bridge");

// ---- Socket path ----

function getUid(): number {
  try {
    return userInfo().uid;
  } catch {
    return process.getuid ? process.getuid() : 0;
  }
}

export function getSocketPath(): string {
  return `/tmp/broc-${getUid()}.sock`;
}

export function getPidPath(): string {
  return `/tmp/broc-${getUid()}.pid`;
}

// ---- Native messaging protocol ----

/**
 * Read a single native messaging frame from a readable stream.
 * Format: 4-byte little-endian length prefix + JSON payload
 */
function readNativeMessage(stream: NodeJS.ReadableStream): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onReadable = () => {
      const lengthBuf = stream.read(4) as Buffer | null;
      if (!lengthBuf) return;

      stream.removeListener("readable", onReadable);

      const length = lengthBuf.readUInt32LE(0);

      if (length > 1024 * 1024) {
        reject(new Error(`Message too large: ${length} bytes`));
        return;
      }

      const readPayload = () => {
        const payload = stream.read(length) as Buffer | null;
        if (!payload) {
          stream.once("readable", readPayload);
          return;
        }

        try {
          resolve(JSON.parse(payload.toString("utf-8")));
        } catch (err) {
          reject(new Error(`Invalid JSON: ${err}`));
        }
      };

      readPayload();
    };

    stream.on("readable", onReadable);
    stream.once("end", () => reject(new Error("Stream ended")));
    stream.once("error", reject);
  });
}

/**
 * Write a native messaging frame to a writable stream.
 * Format: 4-byte little-endian length prefix + JSON payload
 */
function writeNativeMessage(stream: NodeJS.WritableStream, message: unknown): void {
  const json = JSON.stringify(message);
  const payload = Buffer.from(json, "utf-8");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32LE(payload.length, 0);
  stream.write(lengthBuf);
  stream.write(payload);
}

// ---- Socket framing (same length-prefix protocol, over a socket) ----

/**
 * Write a length-prefixed JSON frame to a socket.
 */
function writeSocketMessage(socket: Socket, message: unknown): void {
  const json = JSON.stringify(message);
  const payload = Buffer.from(json, "utf-8");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32LE(payload.length, 0);
  socket.write(Buffer.concat([lengthBuf, payload]));
}

/**
 * State for incremental socket frame parsing.
 */
interface SocketReadState {
  buf: Buffer;
}

/**
 * Parse any complete frames from accumulated socket data.
 * Returns array of parsed messages.
 */
function parseSocketFrames(state: SocketReadState, chunk: Buffer): unknown[] {
  state.buf = Buffer.concat([state.buf, chunk]);
  const messages: unknown[] = [];

  while (state.buf.length >= 4) {
    const length = state.buf.readUInt32LE(0);
    if (length > 1024 * 1024) {
      // Corrupt frame — reset buffer
      log.warn(`Oversized socket frame (${length}), resetting buffer`);
      state.buf = Buffer.alloc(0);
      break;
    }
    if (state.buf.length < 4 + length) break;

    const payload = state.buf.subarray(4, 4 + length);
    state.buf = state.buf.subarray(4 + length);

    try {
      messages.push(JSON.parse(payload.toString("utf-8")));
    } catch (err) {
      log.warn("Failed to parse socket frame JSON:", err);
    }
  }

  return messages;
}

// ---- Message types ----

/** Valid request types (MCP → extension via bridge) */
const VALID_REQUEST_TYPES = new Set(["observe", "act", "list_tabs", "extension_status", "open_tab", "open_notebook", "interrupt", "ping"]);

/** Valid response/event types (extension → MCP via bridge) */
const VALID_RESPONSE_TYPES = new Set([
  "observe_result",
  "act_result",
  "list_tabs_result",
  "extension_status_result",
  "open_tab_result",
  "open_notebook_result",
  "interrupt_result",
  "pong",
  "error",
  "event",
]);

// ---- Core bridge state ----

/** Currently connected MCP/CLI socket clients */
const clients = new Set<Socket>();

/**
 * Broadcast a message (from extension) to all connected socket clients.
 */
function broadcastToClients(message: unknown): void {
  for (const client of clients) {
    try {
      writeSocketMessage(client, message);
    } catch {
      clients.delete(client);
    }
  }
}

// ---- Ping/pong (handled locally, not forwarded to extension) ----

function handlePing(requestId: string, client: Socket): void {
  writeSocketMessage(client, {
    type: "pong",
    id: requestId,
    timestamp: Date.now(),
    uptime: process.uptime(),
    pid: process.pid,
  });
}

// ---- Unix socket server (MCP / CLI side) ----

function startSocketServer(socketPath: string): Server {
  // Remove stale socket file
  if (existsSync(socketPath)) {
    try { unlinkSync(socketPath); } catch { /* ignore */ }
  }

  const server = createServer((socket: Socket) => {
    log.info("MCP/CLI client connected");
    clients.add(socket);

    const readState: SocketReadState = { buf: Buffer.alloc(0) };

    socket.on("data", (chunk: Buffer) => {
      const messages = parseSocketFrames(readState, chunk);
      for (const msg of messages) {
        const m = msg as Record<string, unknown>;
        log.debug("From client:", JSON.stringify(m).slice(0, 200));

        if (!m || typeof m.type !== "string") {
          log.warn("Client sent invalid message (no type)");
          continue;
        }

        // Handle ping locally — don't forward to extension
        if (m.type === "ping") {
          handlePing((m.id as string) ?? "ping", socket);
          continue;
        }

        // Forward request to extension via native messaging
        if (VALID_REQUEST_TYPES.has(m.type)) {
          writeNativeMessage(process.stdout, m);
          log.debug("Forwarded to extension:", JSON.stringify(m).slice(0, 200));
        } else {
          log.warn(`Unknown request type from client: ${m.type}`);
        }
      }
    });

    socket.on("close", () => {
      log.info("MCP/CLI client disconnected");
      clients.delete(socket);
    });

    socket.on("error", (err) => {
      log.warn("Client socket error:", err.message);
      clients.delete(socket);
    });
  });

  server.listen(socketPath, () => {
    log.info(`Socket server listening at ${socketPath}`);
  });

  server.on("error", (err) => {
    log.error("Socket server error:", err);
  });

  return server;
}

// ---- Main loop ----

async function main(): Promise<void> {
  log.info("Native messaging bridge started");
  log.info(`PID: ${process.pid}`);

  const socketPath = getSocketPath();
  const pidPath = getPidPath();

  // Write PID file so clients can detect if bridge is running
  try {
    writeFileSync(pidPath, String(process.pid), "utf-8");
  } catch (err) {
    log.warn("Failed to write PID file:", err);
  }

  // Clean up socket and PID on exit
  const cleanup = () => {
    try { if (existsSync(socketPath)) unlinkSync(socketPath); } catch { /* ignore */ }
    try { if (existsSync(pidPath)) unlinkSync(pidPath); } catch { /* ignore */ }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  // Start the Unix socket server for MCP/CLI clients
  startSocketServer(socketPath);

  // Read from extension via native messaging (stdin)
  process.stdin.pause();

  while (true) {
    let raw: unknown;
    try {
      raw = await readNativeMessage(process.stdin);
    } catch (err) {
      if ((err as Error).message === "Stream ended") {
        log.info("stdin closed (extension disconnected), shutting down");
        break;
      }
      log.error("stdin read error:", err);
      continue;
    }

    log.debug("From extension:", JSON.stringify(raw).slice(0, 200));

    const m = raw as Record<string, unknown>;
    if (!m || typeof m.type !== "string") {
      log.warn("Dropping malformed extension message");
      continue;
    }

    if (!VALID_RESPONSE_TYPES.has(m.type)) {
      log.warn(`Dropping unknown extension message type: ${m.type}`);
      continue;
    }

    // Forward response/event to all connected MCP/CLI clients
    broadcastToClients(raw);
    log.debug("Broadcast to clients:", JSON.stringify(raw).slice(0, 200));
  }

  cleanup();
  process.exit(0);
}

main().catch((err) => {
  log.error("Fatal:", err);
  process.exit(1);
});
