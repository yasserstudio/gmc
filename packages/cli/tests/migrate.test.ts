import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";

// vi.hoisted so these are initialized before the hoisted vi.mock factories run
// (@gmc-cli/auth is imported very early via program.ts → auth.ts).
const { resolveAuth, probeMerchantApi } = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  probeMerchantApi: vi.fn(),
}));

vi.mock("@gmc-cli/auth", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/auth")>();
  return { ...actual, resolveAuth };
});

vi.mock("@gmc-cli/api", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/api")>();
  return { ...actual, probeMerchantApi };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

const PASS_CLIENT = {
  getAccessToken: async () => "tok",
  getClientEmail: () => "sa@x.iam.gserviceaccount.com",
  getProjectId: () => "proj-1",
};

describe("gmc migrate scopes", () => {
  let writes: string[];
  let dir: string;
  let configDir: string;
  let savedEnv: Record<string, string | undefined>;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    dir = mkdtempSync(join(tmpdir(), "gmc-migrate-"));
    configDir = mkdtempSync(join(tmpdir(), "gmc-migrate-cfg-"));
    process.env["GMC_CONFIG_DIR"] = configDir;
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    // Defaults: a healthy credential + a reachable Merchant API.
    resolveAuth.mockResolvedValue(PASS_CLIENT);
    probeMerchantApi.mockResolvedValue({ status: "pass", message: "Merchant API reachable." });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
    for (const key of ENV) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const out = (): string => writes.join("");
  const configPath = (): string => join(configDir, "config.json");

  it("audits scopes and reports a healthy setup (exit 0)", async () => {
    await run(["migrate", "scopes"]);
    expect(out()).toContain("OAuth scope: unchanged");
    expect(out()).toContain("✓ Credential resolved");
    expect(out()).toContain("✓ Merchant API access");
    expect(process.exitCode).toBe(0);
    expect(existsSync(configPath())).toBe(false);
  });

  it("surfaces a failing probe but still exits 0 (advisory)", async () => {
    probeMerchantApi.mockResolvedValue({
      status: "fail",
      message: "The Merchant API is not enabled.",
      suggestion: "Enable it.",
    });
    await run(["migrate", "scopes"]);
    expect(out()).toContain("✗ Merchant API access");
    expect(out()).toContain("Enable it.");
    expect(process.exitCode).toBe(0);
  });

  it("surfaces the cause when the live probe throws, still exiting 0", async () => {
    probeMerchantApi.mockRejectedValue(new Error("network unreachable"));
    await run(["migrate", "scopes"]);
    expect(out()).toContain("⚠ Merchant API access");
    expect(out()).toContain("network unreachable");
    expect(process.exitCode).toBe(0);
  });

  it("warns when the credential cannot be resolved", async () => {
    const { AuthError } = await import("@gmc-cli/auth");
    resolveAuth.mockRejectedValue(new AuthError("No credential found.", "AUTH_NONE", "Run gmc auth login."));
    await run(["migrate", "scopes"]);
    expect(out()).toContain("⚠ Credential resolved");
    expect(out()).toContain("No credential found.");
    expect(process.exitCode).toBe(0);
  });

  it("dry-runs a config migration from a legacy file without writing", async () => {
    const from = join(dir, "merchant-info.json");
    writeFileSync(from, JSON.stringify({ merchantId: 123456789 }));
    await run(["-p", "store", "migrate", "scopes", "--from", from, "--set-default"]);
    expect(out()).toContain('Would create profile "store" → account 123456789');
    expect(out()).toContain('Would set "store" as the default profile');
    expect(out()).toContain("Re-run with --write to apply.");
    expect(existsSync(configPath())).toBe(false);
  });

  it("writes the migrated profile with --write and sets the default", async () => {
    const from = join(dir, "merchant-info.json");
    writeFileSync(from, JSON.stringify({ merchantId: "123456789" }));
    await run(["-p", "store", "migrate", "scopes", "--from", from, "--set-default", "--write"]);
    expect(out()).toContain('Created profile "store" → account 123456789');
    expect(out()).toContain("Verify with `gmc doctor`");
    const saved = JSON.parse(readFileSync(configPath(), "utf-8"));
    expect(saved).toEqual({ defaultProfile: "store", profiles: { store: { accountId: "123456789" } } });
    expect(process.exitCode).toBe(0);
  });

  it("migrates from --account when no file is given", async () => {
    await run(["-p", "store", "-a", "555", "migrate", "scopes", "--write"]);
    const saved = JSON.parse(readFileSync(configPath(), "utf-8"));
    expect(saved.profiles.store.accountId).toBe("555");
  });

  it("reports a no-op when the profile already targets the account", async () => {
    writeFileSync(configPath(), JSON.stringify({ profiles: { store: { accountId: "555" } } }));
    await run(["-p", "store", "-a", "555", "migrate", "scopes", "--write"]);
    expect(out()).toContain("Nothing to do.");
  });

  it("fails with a usage error on a non-numeric --account", async () => {
    await run(["-a", "abc", "migrate", "scopes"]);
    expect(process.exitCode).toBe(2);
  });

  it("fails on an invalid legacy file", async () => {
    const from = join(dir, "bad.json");
    writeFileSync(from, JSON.stringify({ noMerchant: true }));
    await run(["migrate", "scopes", "--from", from]);
    expect(process.exitCode).toBe(2);
  });

  it("emits a JSON envelope with audit, plan, and written", async () => {
    const from = join(dir, "merchant-info.json");
    writeFileSync(from, JSON.stringify({ merchantId: "123456789" }));
    await run(["-j", "-p", "store", "migrate", "scopes", "--from", from]);
    const parsed = JSON.parse(out());
    expect(parsed.audit.scopeUnchanged).toBe(true);
    expect(parsed.plan).toMatchObject({ profileName: "store", accountId: "123456789", action: "create" });
    expect(parsed.written).toBe(false);
  });
});
