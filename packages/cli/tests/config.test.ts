import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProgram } from "../src/program.js";

let dir: string;
let configFile: string;
let writes: string[];
let savedDir: string | undefined;
let savedProfile: string | undefined;
let savedAccount: string | undefined;

beforeEach(async () => {
  process.exitCode = 0;
  dir = await mkdtemp(join(tmpdir(), "gmc-cli-cfg-"));
  configFile = join(dir, "config.json");
  savedDir = process.env["GMC_CONFIG_DIR"];
  savedProfile = process.env["GMC_PROFILE"];
  savedAccount = process.env["GMC_ACCOUNT_ID"];
  process.env["GMC_CONFIG_DIR"] = dir;
  delete process.env["GMC_PROFILE"];
  delete process.env["GMC_ACCOUNT_ID"];
  writes = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  const restore = (key: string, value: string | undefined): void => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("GMC_CONFIG_DIR", savedDir);
  restore("GMC_PROFILE", savedProfile);
  restore("GMC_ACCOUNT_ID", savedAccount);
  await rm(dir, { recursive: true, force: true });
  process.exitCode = 0;
});

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc config", () => {
  it("path --json reports the config dir and file", async () => {
    await run(["config", "path", "--json"]);
    const out = JSON.parse(writes.join("")) as { ok: boolean; configDir: string; configFile: string };
    expect(out.ok).toBe(true);
    expect(out.configDir).toBe(dir);
    expect(out.configFile).toBe(configFile);
  });

  it("list --json shows profiles and marks the default", async () => {
    await writeFile(
      configFile,
      JSON.stringify({
        defaultProfile: "prod",
        profiles: { prod: { accountId: "1" }, staging: { accountId: "2" } },
      }),
    );
    await run(["config", "list", "--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({
      ok: true,
      defaultProfile: "prod",
      profiles: [
        { name: "prod", accountId: "1", default: true },
        { name: "staging", accountId: "2", default: false },
      ],
    });
  });

  it("current resolves the file's default profile", async () => {
    await writeFile(
      configFile,
      JSON.stringify({ defaultProfile: "prod", profiles: { prod: { accountId: "1" } } }),
    );
    await run(["config", "current", "--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({ ok: true, profile: "prod", accountId: "1" });
  });

  it("--profile overrides the default profile", async () => {
    await writeFile(
      configFile,
      JSON.stringify({
        defaultProfile: "prod",
        profiles: { prod: { accountId: "1" }, staging: { accountId: "2" } },
      }),
    );
    await run(["--profile", "staging", "config", "current", "--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({ ok: true, profile: "staging", accountId: "2" });
  });

  it("surfaces a malformed config as exit 4", async () => {
    await writeFile(configFile, "{ not json");
    await run(["config", "current", "--json"]);
    const out = JSON.parse(writes.join("")) as { ok: boolean; error: { code: string } };
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("CONFIG_INVALID");
    expect(process.exitCode).toBe(4);
  });
});
