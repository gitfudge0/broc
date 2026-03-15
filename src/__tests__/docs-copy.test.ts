import { readFile } from "fs/promises";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("product docs", () => {
  it("marks Firefox and Chrome repo flows as compatibility-only", async () => {
    const [readme, docs] = await Promise.all([
      readFile(resolve(process.cwd(), "README.md"), "utf-8"),
      readFile(resolve(process.cwd(), "DOCS.md"), "utf-8"),
    ]);

    expect(readme).toContain("repo/dev compatibility only");
    expect(docs).toContain("repo/dev compatibility paths");
  });
});
