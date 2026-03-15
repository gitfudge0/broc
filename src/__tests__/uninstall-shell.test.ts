import { readFile } from "fs/promises";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("scripts/uninstall.sh", () => {
  it("checks the OS and Node before delegating to the Node uninstall helper", async () => {
    const script = await readFile(resolve(process.cwd(), "scripts", "uninstall.sh"), "utf-8");
    expect(script).toContain("Unsupported OS");
    expect(script).toContain("command -v node");
    expect(script).toContain("node scripts/uninstall.mjs");
  });
});
