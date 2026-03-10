import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { BridgeClient } from "../mcp/bridge-client.js";

describe("BridgeClient", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("throws SOCKET_MISSING when the socket does not exist", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "browser-control-bridge-"));
    const client = new BridgeClient({
      socketPath: resolve(tempDir, "missing.sock"),
      connectTimeout: 0,
    });

    await expect(client.start()).rejects.toMatchObject({
      code: "SOCKET_MISSING",
    });
  });

  it("throws CONNECT_FAILED when the socket path exists but cannot accept connections", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "browser-control-bridge-"));
    const fakeSocketPath = resolve(tempDir, "fake.sock");
    await writeFile(fakeSocketPath, "");

    const client = new BridgeClient({
      socketPath: fakeSocketPath,
      connectTimeout: 0,
    });

    await expect(client.start()).rejects.toMatchObject({
      code: "CONNECT_FAILED",
    });
  });

  it("throws NOT_CONNECTED when requests are made without an active socket", async () => {
    const client = new BridgeClient();

    await expect(client.request({ type: "ping" })).rejects.toMatchObject({
      code: "NOT_CONNECTED",
    });
  });
});
