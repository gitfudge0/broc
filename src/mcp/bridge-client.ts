// ============================================================
// Bridge client — connects MCP server / CLI to the native messaging bridge
//
// The bridge host process is launched by the browser extension via native
// messaging. This client connects to it via a Unix socket.
//
// Socket path: /tmp/broc-<uid>.sock
// ============================================================

import { createConnection, type Socket } from "net";
import { existsSync, readFileSync } from "fs";
import { userInfo } from "os";
import { createNodeLogger } from "../shared/logger.js";

const log = createNodeLogger("bridge-client");

// ---- Socket path (must match bridge/host.ts) ----

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

/**
 * Returns true if the bridge process appears to be running
 * (PID file exists and that PID is alive).
 */
export function isBridgeRunning(): boolean {
  const pidPath = getPidPath();
  if (!existsSync(pidPath)) return false;
  try {
    const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
    if (!isNaN(pid)) {
      process.kill(pid, 0); // Throws if process not found
      return true;
    }
  } catch {
    // PID doesn't exist or no permission — either way not running
  }
  return false;
}

export interface BridgeOptions {
  /** Path to the Unix socket (default: /tmp/broc-<uid>.sock) */
  socketPath?: string;
  /** Timeout for requests in ms (default: 30000) */
  timeout?: number;
  /** How long to wait for socket to become available in ms (default: 5000) */
  connectTimeout?: number;
}

export type BridgeClientErrorCode =
  | "SOCKET_MISSING"
  | "CONNECT_FAILED"
  | "NOT_CONNECTED"
  | "DISCONNECTED"
  | "PING_FAILED";

export class BridgeClientError extends Error {
  code: BridgeClientErrorCode;
  details?: { socketPath?: string; pidPath?: string; cause?: string };

  constructor(
    code: BridgeClientErrorCode,
    message: string,
    details?: { socketPath?: string; pidPath?: string; cause?: string },
  ) {
    super(message);
    this.name = "BridgeClientError";
    this.code = code;
    this.details = details;
  }
}

type MessageHandler = (message: unknown) => void;

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Client that connects to the bridge Unix socket and provides
 * request/response messaging to the browser extension.
 */
export class BridgeClient {
  private socket: Socket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers: MessageHandler[] = [];
  private nextId = 1;
  private buf = Buffer.alloc(0);
  private timeout: number;
  private connectTimeout: number;
  private socketPath: string;

  constructor(options: BridgeOptions = {}) {
    this.timeout = options.timeout ?? 30000;
    this.connectTimeout = options.connectTimeout ?? 5000;
    this.socketPath = options.socketPath ?? getSocketPath();
  }

  /**
   * Connect to the bridge socket.
   * Retries until connectTimeout if the socket isn't ready yet.
   */
  async start(): Promise<void> {
    if (this.socket?.writable) return;

    const deadline = Date.now() + this.connectTimeout;

    while (true) {
      if (!existsSync(this.socketPath)) {
        if (Date.now() >= deadline) {
          throw new BridgeClientError(
            "SOCKET_MISSING",
            `Bridge socket not found at ${this.socketPath}.`,
            { socketPath: this.socketPath, pidPath: getPidPath() },
          );
        }
        await sleep(200);
        continue;
      }

      try {
        await this.connect();
        return;
      } catch (err) {
        if (Date.now() >= deadline) {
          throw new BridgeClientError(
            "CONNECT_FAILED",
            `Could not connect to bridge socket at ${this.socketPath}.`,
            {
              socketPath: this.socketPath,
              pidPath: getPidPath(),
              cause: err instanceof Error ? err.message : String(err),
            },
          );
        }
        await sleep(200);
      }
    }
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);

      socket.once("connect", () => {
        log.info("Connected to bridge socket");
        this.socket = socket;
        resolve();
      });

      socket.once("error", (err) => {
        reject(err);
      });

      socket.on("data", (chunk: Buffer) => {
        this.handleData(chunk);
      });

      socket.on("close", () => {
        log.info("Bridge socket closed");
        this.socket = null;
        for (const [, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new BridgeClientError(
            "DISCONNECTED",
            "Bridge disconnected.",
            { socketPath: this.socketPath, pidPath: getPidPath() },
          ));
        }
        this.pending.clear();
      });

      socket.on("error", (err) => {
        log.warn("Bridge socket error:", err.message);
      });
    });
  }

  /**
   * Disconnect from the bridge socket.
   */
  stop(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  /**
   * Register a handler for push events from the extension.
   */
  onEvent(handler: MessageHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Send a request to the extension and wait for a response.
   */
  async request(message: Record<string, unknown>): Promise<unknown> {
    if (!this.socket?.writable) {
      throw new BridgeClientError(
        "NOT_CONNECTED",
        "Bridge not connected.",
        { socketPath: this.socketPath, pidPath: getPidPath() },
      );
    }

    const id = `req_${this.nextId++}`;
    const sessionId = (message.sessionId as string) || "default";
    const fullMessage = { ...message, id, sessionId };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pending.set(id, { resolve, reject, timer });
      this.writeMessage(fullMessage);
    });
  }

  /**
   * Ping the bridge to check liveness.
   */
  async ping(timeoutMs = 5000): Promise<{ alive: boolean; uptime?: number; pid?: number }> {
    try {
      const response = await Promise.race([
        this.request({ type: "ping" }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new BridgeClientError(
            "PING_FAILED",
            "Ping timed out.",
            { socketPath: this.socketPath, pidPath: getPidPath() },
          )), timeoutMs)
        ),
      ]) as Record<string, unknown>;

      if (response.type === "pong") {
        return {
          alive: true,
          uptime: response.uptime as number | undefined,
          pid: response.pid as number | undefined,
        };
      }
      return { alive: false };
    } catch {
      return { alive: false };
    }
  }

  isConnected(): boolean {
    return !!this.socket?.writable;
  }

  /**
   * Write a length-prefixed JSON message to the socket.
   */
  private writeMessage(message: unknown): void {
    const json = JSON.stringify(message);
    const payload = Buffer.from(json, "utf-8");
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(payload.length, 0);
    this.socket!.write(Buffer.concat([lengthBuf, payload]));
  }

  /**
   * Accumulate data and parse complete length-prefixed frames.
   */
  private handleData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);

    while (this.buf.length >= 4) {
      const length = this.buf.readUInt32LE(0);
      if (this.buf.length < 4 + length) break;

      const payload = this.buf.subarray(4, 4 + length);
      this.buf = this.buf.subarray(4 + length);

      try {
        const message = JSON.parse(payload.toString("utf-8")) as Record<string, unknown>;
        this.handleMessage(message);
      } catch (err) {
        log.error("Failed to parse bridge message:", err);
      }
    }
  }

  /**
   * Route an incoming message to the correct handler.
   */
  private handleMessage(message: Record<string, unknown>): void {
    const id = message.id as string | undefined;

    // Response to a pending request
    if (id && this.pending.has(id)) {
      const pending = this.pending.get(id)!;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.resolve(message);
      return;
    }

    // Push event from extension
    if (message.type === "event") {
      for (const handler of this.eventHandlers) {
        try {
          handler(message);
        } catch (err) {
          log.error("Event handler error:", err);
        }
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
