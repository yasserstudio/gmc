import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { loadProductFiles } from "../src/commands/_shared.js";

describe("loadProductFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gmc-load-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns files in name order under concurrency, and records failures", async () => {
    // More files than the concurrency cap (16) so the bounded pool is exercised and
    // we can prove results are reassembled in name order regardless of read timing.
    for (let i = 0; i < 40; i++) {
      const n = String(i).padStart(2, "0");
      writeFileSync(join(dir, `p${n}.json`), JSON.stringify({ offerId: `SKU${n}` }));
    }
    writeFileSync(join(dir, "z-broken.json"), "not json {");

    const { files, failures } = await loadProductFiles(dir);

    expect(files).toHaveLength(40);
    expect(failures.map((f) => f.file)).toEqual(["z-broken.json"]);

    const names = files.map((f) => f.file);
    expect(names).toEqual([...names].sort());
    expect(files.map((f) => f.input.offerId).at(0)).toBe("SKU00");
  });

  it("ignores non-JSON files", async () => {
    writeFileSync(join(dir, "a.json"), JSON.stringify({ offerId: "A" }));
    writeFileSync(join(dir, "notes.txt"), "ignore me");
    const { files, failures } = await loadProductFiles(dir);
    expect(files).toHaveLength(1);
    expect(failures).toHaveLength(0);
  });

  it("throws on an unreadable directory", async () => {
    await expect(loadProductFiles(join(dir, "does-not-exist"))).rejects.toThrow(
      /Could not read feed directory/,
    );
  });
});
