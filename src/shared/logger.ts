// ============================================================
// Debug logging — configurable verbose logging for all components
//
// Toggle via:
//   - Extension: browser.storage.local.set({ debug: true })
//   - Node (bridge/MCP): BROWSER_CONTROL_DEBUG=1
//   - CLI: browser-control --debug
//
// All debug output goes to:
//   - Extension: browser console (background/content)
//   - Node: stderr
// ============================================================

/** Log levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Minimal structured logger.
 * In extension context, uses console methods.
 * In Node context, writes to stderr.
 */
export class Logger {
  private prefix: string;
  private minLevel: number;
  private enabled: boolean;

  constructor(prefix: string, options?: { debug?: boolean; level?: LogLevel }) {
    this.prefix = prefix;
    this.enabled = options?.debug ?? false;
    this.minLevel = LOG_LEVELS[options?.level ?? (this.enabled ? "debug" : "info")];
  }

  /** Enable or disable debug-level logging */
  setDebug(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.minLevel = LOG_LEVELS.debug;
    } else {
      this.minLevel = LOG_LEVELS.info;
    }
  }

  /** Check if debug logging is enabled */
  get isDebug(): boolean {
    return this.enabled;
  }

  debug(...args: unknown[]): void {
    if (this.minLevel <= LOG_LEVELS.debug) {
      this.output("debug", args);
    }
  }

  info(...args: unknown[]): void {
    if (this.minLevel <= LOG_LEVELS.info) {
      this.output("info", args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.minLevel <= LOG_LEVELS.warn) {
      this.output("warn", args);
    }
  }

  error(...args: unknown[]): void {
    if (this.minLevel <= LOG_LEVELS.error) {
      this.output("error", args);
    }
  }

  private output(level: LogLevel, args: unknown[]): void {
    const tag = `[${this.prefix}]`;
    // Detect environment: if process.stderr exists, we're in Node
    if (typeof process !== "undefined" && process.stderr?.write) {
      const timestamp = new Date().toISOString().slice(11, 23);
      const message = args.map((a) =>
        typeof a === "string" ? a : JSON.stringify(a)
      ).join(" ");
      process.stderr.write(`${timestamp} ${level.toUpperCase().padEnd(5)} ${tag} ${message}\n`);
    } else {
      // Browser console
      const fn = level === "debug" ? console.debug
        : level === "warn" ? console.warn
        : level === "error" ? console.error
        : console.log;
      fn(tag, ...args);
    }
  }
}

/**
 * Create a logger for the Node (bridge/MCP) side.
 * Reads BROWSER_CONTROL_DEBUG from env.
 */
export function createNodeLogger(prefix: string): Logger {
  const debug = typeof process !== "undefined" && (
    process.env.BROWSER_CONTROL_DEBUG === "1" ||
    process.env.BROWSER_CONTROL_DEBUG === "true"
  );
  return new Logger(prefix, { debug });
}

/**
 * Create a logger for the extension side.
 * Initially non-debug; call `initExtensionDebug(logger)` to read
 * the debug flag from storage.local and update.
 */
export function createExtensionLogger(prefix: string): Logger {
  return new Logger(prefix, { debug: false });
}

/**
 * Initialize extension debug mode from storage.local.
 * Call this at startup in background/content scripts.
 */
export async function initExtensionDebug(logger: Logger): Promise<void> {
  // `browser` is only available in the extension context
  if (typeof browser !== "undefined" && browser.storage?.local) {
    try {
      const result = await browser.storage.local.get("debug");
      if (result.debug) {
        logger.setDebug(true);
        logger.debug("Debug mode enabled via storage.local");
      }
    } catch {
      // storage not available — ignore
    }

    // Listen for changes
    try {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.debug) {
          const newValue = !!changes.debug.newValue;
          logger.setDebug(newValue);
          logger.info(`Debug mode ${newValue ? "enabled" : "disabled"}`);
        }
      });
    } catch {
      // onChanged not available — ignore
    }
  }
}
