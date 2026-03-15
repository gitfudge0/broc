import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { detectInstalledClients } from "../cli/client-detect.js";

describe("client detection", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (!tempDir) return;
    const { rm } = await import("fs/promises");
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it("prefers config-file detection over other signals", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-client-"));
    await mkdir(resolve(tempDir, ".codex"), { recursive: true });
    await writeFile(resolve(tempDir, ".codex", "config.toml"), "model = \"gpt-5\"\n");

    const codex = detectInstalledClients(tempDir, { PATH: "" }).find((client) => client.client === "codex");
    expect(codex).toMatchObject({
      status: "detected",
      method: "config",
      evidence: resolve(tempDir, ".codex", "config.toml"),
    });
  });

  it("returns not_found when no client markers exist", async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "broc-client-"));
    expect(detectInstalledClients(tempDir, { PATH: "" }).every((client) => client.status === "not_found")).toBe(true);
  });
});
