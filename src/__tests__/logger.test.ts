// ============================================================
// Tests for the Logger module
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, createNodeLogger } from "../shared/logger.js";

describe("Logger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("creates a logger with a prefix", () => {
    const log = new Logger("test");
    log.info("hello");
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain("[test]");
    expect(output).toContain("hello");
  });

  it("respects log levels — debug is suppressed by default", () => {
    const log = new Logger("test");
    log.debug("should not appear");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("shows debug when debug option is true", () => {
    const log = new Logger("test", { debug: true });
    log.debug("should appear");
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain("DEBUG");
  });

  it("formats log level correctly", () => {
    const log = new Logger("test");
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg");

    expect((stderrSpy.mock.calls[0][0] as string)).toContain("INFO");
    expect((stderrSpy.mock.calls[1][0] as string)).toContain("WARN");
    expect((stderrSpy.mock.calls[2][0] as string)).toContain("ERROR");
  });

  it("includes timestamp in output", () => {
    const log = new Logger("test");
    log.info("timestamped");
    const output = stderrSpy.mock.calls[0][0] as string;
    // Timestamp format: HH:MM:SS.mmm
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it("serializes objects to JSON", () => {
    const log = new Logger("test");
    log.info("data:", { key: "value" });
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('{"key":"value"}');
  });

  it("setDebug toggles debug mode", () => {
    const log = new Logger("test");
    expect(log.isDebug).toBe(false);

    log.setDebug(true);
    expect(log.isDebug).toBe(true);
    log.debug("now visible");
    expect(stderrSpy).toHaveBeenCalled();

    stderrSpy.mockClear();
    log.setDebug(false);
    expect(log.isDebug).toBe(false);
    log.debug("now hidden");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("outputs info even when debug is off", () => {
    const log = new Logger("test");
    log.info("always visible");
    expect(stderrSpy).toHaveBeenCalled();
  });
});

describe("createNodeLogger", () => {
  const originalEnv = process.env.BROC_DEBUG;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BROC_DEBUG;
    } else {
      process.env.BROC_DEBUG = originalEnv;
    }
  });

  it("creates a logger with debug off by default", () => {
    delete process.env.BROC_DEBUG;
    const log = createNodeLogger("test");
    expect(log.isDebug).toBe(false);
  });

  it("creates a logger with debug on when env var is set", () => {
    process.env.BROC_DEBUG = "1";
    const log = createNodeLogger("test");
    expect(log.isDebug).toBe(true);
  });

  it("creates a logger with debug on when env var is 'true'", () => {
    process.env.BROC_DEBUG = "true";
    const log = createNodeLogger("test");
    expect(log.isDebug).toBe(true);
  });
});
