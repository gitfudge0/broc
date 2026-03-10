// ============================================================
// Tests for the bridge protocol — message framing and validation
// ============================================================

import { describe, it, expect } from "vitest";

// ---- Length-prefixed framing tests ----

/**
 * Encode a message using the native messaging length-prefixed JSON format.
 * This mirrors writeNativeMessage in host.ts and BridgeClient.
 */
function encodeNativeMessage(message: unknown): Buffer {
  const json = JSON.stringify(message);
  const payload = Buffer.from(json, "utf-8");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32LE(payload.length, 0);
  return Buffer.concat([lengthBuf, payload]);
}

/**
 * Decode a native messaging frame, returning the message and remaining buffer.
 */
function decodeNativeMessage(buffer: Buffer): { message: unknown; rest: Buffer } | null {
  if (buffer.length < 4) return null;
  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return null;
  const payload = buffer.subarray(4, 4 + length);
  const message = JSON.parse(payload.toString("utf-8"));
  const rest = buffer.subarray(4 + length);
  return { message, rest };
}

describe("native messaging framing", () => {
  it("encodes and decodes a simple message", () => {
    const original = { type: "ping", id: "1" };
    const encoded = encodeNativeMessage(original);
    const decoded = decodeNativeMessage(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.message).toEqual(original);
    expect(decoded!.rest.length).toBe(0);
  });

  it("handles UTF-8 correctly", () => {
    const original = { type: "test", text: "hello 日本語 🌍" };
    const encoded = encodeNativeMessage(original);
    const decoded = decodeNativeMessage(encoded);
    expect(decoded!.message).toEqual(original);
  });

  it("encodes length as little-endian uint32", () => {
    const message = { type: "test" };
    const encoded = encodeNativeMessage(message);
    const json = JSON.stringify(message);
    const expectedLength = Buffer.byteLength(json, "utf-8");
    expect(encoded.readUInt32LE(0)).toBe(expectedLength);
  });

  it("returns null for incomplete buffer (no length)", () => {
    const buffer = Buffer.alloc(2);
    expect(decodeNativeMessage(buffer)).toBeNull();
  });

  it("returns null for incomplete buffer (partial payload)", () => {
    const message = { type: "test", data: "a".repeat(100) };
    const encoded = encodeNativeMessage(message);
    // Cut off half the payload
    const partial = encoded.subarray(0, 4 + 10);
    expect(decodeNativeMessage(partial)).toBeNull();
  });

  it("handles multiple concatenated messages", () => {
    const msg1 = { type: "first", id: "1" };
    const msg2 = { type: "second", id: "2" };
    const combined = Buffer.concat([
      encodeNativeMessage(msg1),
      encodeNativeMessage(msg2),
    ]);

    const result1 = decodeNativeMessage(combined);
    expect(result1).not.toBeNull();
    expect(result1!.message).toEqual(msg1);
    expect(result1!.rest.length).toBeGreaterThan(0);

    const result2 = decodeNativeMessage(result1!.rest);
    expect(result2).not.toBeNull();
    expect(result2!.message).toEqual(msg2);
    expect(result2!.rest.length).toBe(0);
  });

  it("handles empty object", () => {
    const encoded = encodeNativeMessage({});
    const decoded = decodeNativeMessage(encoded);
    expect(decoded!.message).toEqual({});
  });
});

// ---- Message validation tests (mirrors host.ts logic) ----

const VALID_REQUEST_TYPES = new Set([
  "observe",
  "act",
  "list_tabs",
  "extension_status",
  "open_tab",
  "interrupt",
  "ping",
]);

const VALID_RESPONSE_TYPES = new Set([
  "observe_result",
  "act_result",
  "list_tabs_result",
  "extension_status_result",
  "open_tab_result",
  "interrupt_result",
  "error",
  "event",
]);

function validateMessage(
  message: unknown,
  validTypes: Set<string>,
): { type: string; id?: string; [key: string]: unknown } | null {
  if (!message || typeof message !== "object") return null;
  const msg = message as Record<string, unknown>;
  if (typeof msg.type !== "string") return null;
  if (!validTypes.has(msg.type)) return null;
  // Requests must have an id (events and pings may not)
  if (msg.type !== "event" && msg.type !== "ping" && typeof msg.id !== "string") return null;
  return msg as { type: string; id?: string; [key: string]: unknown };
}

describe("message validation", () => {
  const allTypes = new Set([...VALID_REQUEST_TYPES, ...VALID_RESPONSE_TYPES]);

  it("accepts valid request with type and id", () => {
    const msg = { type: "observe", id: "req_1", sessionId: "s1" };
    expect(validateMessage(msg, VALID_REQUEST_TYPES)).not.toBeNull();
  });

  it("accepts ping without id", () => {
    const msg = { type: "ping" };
    expect(validateMessage(msg, VALID_REQUEST_TYPES)).not.toBeNull();
  });

  it("accepts event without id", () => {
    const msg = { type: "event", event: "navigation", data: {} };
    expect(validateMessage(msg, VALID_RESPONSE_TYPES)).not.toBeNull();
  });

  it("rejects null", () => {
    expect(validateMessage(null, allTypes)).toBeNull();
  });

  it("rejects non-object", () => {
    expect(validateMessage("string", allTypes)).toBeNull();
    expect(validateMessage(42, allTypes)).toBeNull();
  });

  it("rejects missing type field", () => {
    expect(validateMessage({ id: "1" }, allTypes)).toBeNull();
  });

  it("rejects unknown type", () => {
    expect(validateMessage({ type: "unknown_type", id: "1" }, allTypes)).toBeNull();
  });

  it("rejects request missing id (except ping/event)", () => {
    expect(validateMessage({ type: "observe" }, VALID_REQUEST_TYPES)).toBeNull();
    expect(validateMessage({ type: "act" }, VALID_REQUEST_TYPES)).toBeNull();
  });

  it("accepts all valid request types", () => {
    for (const type of VALID_REQUEST_TYPES) {
      const msg = type === "ping" ? { type } : { type, id: "test_1" };
      expect(validateMessage(msg, VALID_REQUEST_TYPES)).not.toBeNull();
    }
  });

  it("accepts all valid response types", () => {
    for (const type of VALID_RESPONSE_TYPES) {
      const msg = type === "event" ? { type } : { type, id: "test_1" };
      expect(validateMessage(msg, VALID_RESPONSE_TYPES)).not.toBeNull();
    }
  });
});
