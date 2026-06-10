import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, upsertProfile, ConfigError } from "../src/index.js";

const ENV = ["GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;
let saved: Record<string, string | undefined>;
let dir: string;
let path: string;

beforeEach(async () => {
  saved = {};
  for (const key of ENV) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  dir = await mkdtemp(join(tmpdir(), "gmc-cfg-write-"));
  path = join(dir, "config.json");
});

afterEach(async () => {
  for (const key of ENV) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(dir, { recursive: true, force: true });
});

describe("saveConfig", () => {
  it("writes a config that loadConfig reads back", async () => {
    await saveConfig({ defaultProfile: "p", profiles: { p: { accountId: "1" } } }, path);
    expect(loadConfig(path)).toEqual({ defaultProfile: "p", profiles: { p: { accountId: "1" } } });
  });

  it("writes the file with owner-only permissions", async () => {
    await saveConfig({ profiles: { p: { accountId: "1" } } }, path);
    if (platform() !== "win32") {
      const mode = (await stat(path)).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it("validates before writing — a bad account id never lands on disk", async () => {
    await expect(saveConfig({ profiles: { p: { accountId: "nope" } } }, path)).rejects.toBeInstanceOf(
      ConfigError,
    );
    await expect(readFile(path, "utf-8")).rejects.toThrow();
  });
});

describe("upsertProfile", () => {
  it("creates a profile in a fresh config", async () => {
    const result = await upsertProfile("store", { accountId: "123" }, { configPath: path });
    expect(result.profiles).toEqual({ store: { accountId: "123" } });
    expect(loadConfig(path).profiles?.store?.accountId).toBe("123");
  });

  it("preserves other profiles and the existing default", async () => {
    await writeFile(
      path,
      JSON.stringify({ defaultProfile: "other", profiles: { other: { accountId: "999" } } }),
    );
    const result = await upsertProfile("store", { accountId: "123" }, { configPath: path });
    expect(result.defaultProfile).toBe("other");
    expect(result.profiles).toEqual({
      other: { accountId: "999" },
      store: { accountId: "123" },
    });
  });

  it("sets the default when asked", async () => {
    const result = await upsertProfile(
      "store",
      { accountId: "123" },
      { configPath: path, setDefault: true },
    );
    expect(result.defaultProfile).toBe("store");
  });

  it("overwrites an existing profile's account id", async () => {
    await upsertProfile("store", { accountId: "111" }, { configPath: path });
    await upsertProfile("store", { accountId: "222" }, { configPath: path });
    expect(loadConfig(path).profiles?.store?.accountId).toBe("222");
  });

  it("rejects a reserved profile name", async () => {
    await expect(
      upsertProfile("__proto__", { accountId: "1" }, { configPath: path }),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
