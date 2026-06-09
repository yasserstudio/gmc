import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadPreflightConfig,
  findPreflightConfig,
  PreflightConfigError,
  PREFLIGHT_RC,
} from "../src/index.js";

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "gmc-pf-rc-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("loadPreflightConfig", () => {
  it("returns an empty config when no rc is found", async () => {
    await withDir(async (dir) => {
      // Robust against an unrelated .gmcpreflightrc anywhere up the real tmp path:
      // either nothing is found (empty config) or it resolved to an ancestor we
      // didn't create — never one inside our controlled temp dir.
      const loaded = loadPreflightConfig({ cwd: dir });
      if (loaded.path === undefined) expect(loaded.config).toEqual({});
      else expect(loaded.path.startsWith(dir)).toBe(false);
    });
  });

  it("discovers .gmcpreflightrc by walking up from a subdirectory", async () => {
    await withDir(async (dir) => {
      const rc = join(dir, PREFLIGHT_RC);
      await writeFile(rc, JSON.stringify({ strict: true, rules: { "required.title": "warning" } }));
      const sub = join(dir, "a", "b");
      await mkdir(sub, { recursive: true });
      const loaded = loadPreflightConfig({ cwd: sub });
      expect(loaded.path).toBe(rc);
      expect(loaded.config).toEqual({ strict: true, rules: { "required.title": "warning" } });
    });
  });

  it("loads an explicit --config path", async () => {
    await withDir(async (dir) => {
      const path = join(dir, "custom.json");
      await writeFile(path, JSON.stringify({ ignore: ["a"], targetCountry: "US" }));
      const loaded = loadPreflightConfig({ configPath: path });
      expect(loaded.path).toBe(path);
      expect(loaded.config).toEqual({ ignore: ["a"], targetCountry: "US" });
    });
  });

  it("throws when an explicit --config path is missing", () => {
    expect(() => loadPreflightConfig({ configPath: join(tmpdir(), "gmc-nope-xyz.json") })).toThrow(
      PreflightConfigError,
    );
  });

  const bad: [string, string][] = [
    ["a non-object root", "[]"],
    ["invalid JSON", "{not json"],
    ['"rules" not an object', '{"rules":[]}'],
    ["an invalid severity", '{"rules":{"required.title":"loud"}}'],
    ["a reserved rule key", '{"rules":{"__proto__":"error"}}'],
    ['"ignore" not a string array', '{"ignore":[1]}'],
    ["an empty targetCountry", '{"targetCountry":""}'],
    ['non-boolean "strict"', '{"strict":"yes"}'],
  ];
  for (const [label, contents] of bad) {
    it(`rejects ${label}`, async () => {
      await withDir(async (dir) => {
        const path = join(dir, "custom.json");
        await writeFile(path, contents);
        expect(() => loadPreflightConfig({ configPath: path })).toThrow(PreflightConfigError);
      });
    });
  }
});

describe("findPreflightConfig", () => {
  it("finds no rc inside a dir we didn't write one to", async () => {
    await withDir(async (dir) => {
      // May resolve an ancestor on an unusual machine; assert only that nothing was
      // found *inside* our controlled temp dir.
      const found = findPreflightConfig(dir);
      expect(found === undefined || !found.startsWith(dir)).toBe(true);
    });
  });
});
