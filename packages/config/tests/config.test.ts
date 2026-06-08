import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveProfile, ConfigError, DEFAULT_PROFILE } from "../src/index.js";

const ENV = ["GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function withConfig(contents: string, fn: (path: string) => void | Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "gmc-cfg-"));
  try {
    const path = join(dir, "config.json");
    await writeFile(path, contents);
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("loadConfig", () => {
  it("returns an empty config when the file is missing", () => {
    expect(loadConfig(join(tmpdir(), "gmc-nope-xyz", "config.json"))).toEqual({});
  });

  it("loads and normalizes a valid config", async () => {
    await withConfig(
      JSON.stringify({ defaultProfile: "prod", profiles: { prod: { accountId: "123" } } }),
      (path) => {
        expect(loadConfig(path)).toEqual({
          defaultProfile: "prod",
          profiles: { prod: { accountId: "123" } },
        });
      },
    );
  });

  it("throws ConfigError on malformed JSON", async () => {
    await withConfig("{ not json", (path) => {
      expect(() => loadConfig(path)).toThrow(ConfigError);
      expect(() => loadConfig(path)).toThrowError(/CONFIG_INVALID|valid JSON/);
    });
  });

  it("throws ConfigError when profiles is not an object", async () => {
    await withConfig(JSON.stringify({ profiles: [] }), (path) => {
      expect(() => loadConfig(path)).toThrowError(ConfigError);
    });
  });

  it("throws ConfigError when an accountId is not a numeric string", async () => {
    for (const accountId of [123, "not-numeric"]) {
      await withConfig(JSON.stringify({ profiles: { prod: { accountId } } }), (path) => {
        try {
          loadConfig(path);
          throw new Error("expected loadConfig to throw");
        } catch (err) {
          expect(err).toBeInstanceOf(ConfigError);
          expect((err as ConfigError).code).toBe("CONFIG_INVALID");
        }
      });
    }
  });

  it("throws ConfigError when defaultProfile is not a non-empty string", async () => {
    await withConfig(JSON.stringify({ defaultProfile: "" }), (path) => {
      expect(() => loadConfig(path)).toThrowError(ConfigError);
    });
  });

  it("rejects a reserved profile name (prototype pollution guard)", async () => {
    // JSON.parse makes __proto__ an own key, so Object.entries sees it.
    await withConfig('{ "profiles": { "__proto__": { "accountId": "1" } } }', (path) => {
      expect(() => loadConfig(path)).toThrowError(/reserved/);
    });
  });
});

describe("resolveProfile", () => {
  it("defaults to the 'default' profile with no input", () => {
    expect(resolveProfile({})).toEqual({ name: DEFAULT_PROFILE });
  });

  it("uses the file defaultProfile and its accountId", () => {
    const config = { defaultProfile: "prod", profiles: { prod: { accountId: "123" } } };
    expect(resolveProfile(config)).toEqual({ name: "prod", accountId: "123" });
  });

  it("an explicit profile overrides the file default", () => {
    const config = {
      defaultProfile: "prod",
      profiles: { prod: { accountId: "1" }, staging: { accountId: "2" } },
    };
    expect(resolveProfile(config, { profile: "staging" })).toEqual({
      name: "staging",
      accountId: "2",
    });
  });

  it("GMC_PROFILE selects the profile when nothing explicit is passed", () => {
    process.env["GMC_PROFILE"] = "staging";
    const config = { defaultProfile: "prod", profiles: { staging: { accountId: "2" } } };
    expect(resolveProfile(config)).toEqual({ name: "staging", accountId: "2" });
  });

  it("throws on a reserved profile name", () => {
    expect(() => resolveProfile({}, { profile: "__proto__" })).toThrowError(ConfigError);
  });

  it("does not false-hit on an inherited key like 'toString'", () => {
    // No "toString" profile exists; the Object.hasOwn guard must return undefined
    // rather than Object.prototype.toString.
    expect(resolveProfile({ profiles: { prod: { accountId: "1" } } }, { profile: "toString" })).toEqual({
      name: "toString",
    });
  });

  it("resolves accountId with explicit > env > file precedence", () => {
    const config = { profiles: { default: { accountId: "file" } } };
    process.env["GMC_ACCOUNT_ID"] = "env";
    expect(resolveProfile(config, { accountId: "explicit" }).accountId).toBe("explicit");
    expect(resolveProfile(config).accountId).toBe("env");
    delete process.env["GMC_ACCOUNT_ID"];
    expect(resolveProfile(config).accountId).toBe("file");
  });
});
