import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

const {
  resolveAuth,
  listConversionSources,
  getConversionSource,
  createConversionSource,
  updateConversionSource,
  deleteConversionSource,
  undeleteConversionSource,
} = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  listConversionSources: vi.fn(),
  getConversionSource: vi.fn(),
  createConversionSource: vi.fn(),
  updateConversionSource: vi.fn(),
  deleteConversionSource: vi.fn(),
  undeleteConversionSource: vi.fn(),
}));

vi.mock("@gmc-cli/auth", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/auth")>();
  return { ...actual, resolveAuth };
});

vi.mock("@gmc-cli/api", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/api")>();
  return {
    ...actual,
    MerchantClient: class {
      constructor(_o: unknown) {}
    },
    ConversionsService: class {
      listConversionSources = listConversionSources;
      getConversionSource = getConversionSource;
      createConversionSource = createConversionSource;
      updateConversionSource = updateConversionSource;
      deleteConversionSource = deleteConversionSource;
      undeleteConversionSource = undeleteConversionSource;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc conversions", () => {
  let writes: string[];
  let dir: string;
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-conversions-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-conversions-"));
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      writes.push(String(c));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    resolveAuth.mockResolvedValue({
      getAccessToken: async () => "tok",
      getClientEmail: () => "e",
      getProjectId: () => undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    for (const key of ENV) {
      const v = savedEnv[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  const out = (): string => writes.join("");

  it("lists sources with a state · type summary", async () => {
    listConversionSources.mockResolvedValue([
      {
        name: "accounts/123/conversionSources/abc",
        state: "ACTIVE",
        merchantCenterDestination: { displayName: "Store", currencyCode: "USD" },
      },
    ]);
    await run(["conversions", "list"]);
    expect(out()).toContain("1 conversion source(s)");
    expect(out()).toContain("abc");
    expect(out()).toContain("ACTIVE");
    expect(out()).toContain('Merchant Center "Store" (USD)');
  });

  it("emits JSON for list under a conversionSources envelope", async () => {
    listConversionSources.mockResolvedValue([{ name: "accounts/123/conversionSources/abc" }]);
    await run(["-j", "conversions", "list"]);
    expect(JSON.parse(out())).toEqual({
      conversionSources: [{ name: "accounts/123/conversionSources/abc" }],
    });
  });

  it("gets one source", async () => {
    getConversionSource.mockResolvedValue({
      name: "accounts/123/conversionSources/abc",
      state: "ACTIVE",
      googleAnalyticsLink: { propertyId: "987" },
    });
    await run(["conversions", "get", "abc"]);
    expect(getConversionSource).toHaveBeenCalledWith("abc");
    expect(out()).toContain("GA property 987");
  });

  it("creates a Google Analytics link from --ga-property", async () => {
    createConversionSource.mockResolvedValue({ name: "accounts/123/conversionSources/new" });
    await run(["conversions", "create", "--ga-property", "987"]);
    expect(createConversionSource).toHaveBeenCalledWith({
      googleAnalyticsLink: { propertyId: "987" },
    });
    expect(out()).toContain("Created conversion source new");
  });

  it("creates a Merchant Center destination from flags", async () => {
    createConversionSource.mockResolvedValue({ name: "accounts/123/conversionSources/n2" });
    await run([
      "conversions",
      "create",
      "--merchant-center",
      "--currency",
      "USD",
      "--display-name",
      "Store",
    ]);
    expect(createConversionSource).toHaveBeenCalledWith({
      merchantCenterDestination: { currencyCode: "USD", displayName: "Store" },
    });
  });

  it("rejects --merchant-center without --currency (exit 2)", async () => {
    await run(["conversions", "create", "--merchant-center", "--display-name", "Store"]);
    expect(createConversionSource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects mixing --ga-property and --merchant-center (exit 2)", async () => {
    await run([
      "conversions",
      "create",
      "--ga-property",
      "987",
      "--merchant-center",
      "--currency",
      "USD",
    ]);
    expect(createConversionSource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects create with no source type (exit 2)", async () => {
    await run(["conversions", "create"]);
    expect(createConversionSource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("creates from --file, keeping only writable source keys", async () => {
    const file = join(dir, "src.json");
    writeFileSync(
      file,
      JSON.stringify({
        name: "accounts/123/conversionSources/should-be-stripped",
        state: "ACTIVE",
        googleAnalyticsLink: { propertyId: "555" },
      }),
    );
    createConversionSource.mockResolvedValue({ name: "accounts/123/conversionSources/n3" });
    await run(["conversions", "create", "--file", file]);
    expect(createConversionSource).toHaveBeenCalledWith({
      googleAnalyticsLink: { propertyId: "555" },
    });
  });

  it("rejects mixing --file and convenience flags (exit 2)", async () => {
    const file = join(dir, "src.json");
    writeFileSync(file, JSON.stringify({ googleAnalyticsLink: { propertyId: "555" } }));
    await run(["conversions", "create", "--file", file, "--ga-property", "987"]);
    expect(createConversionSource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("updates a Merchant Center display name via a nested mask", async () => {
    updateConversionSource.mockResolvedValue({ name: "accounts/123/conversionSources/abc" });
    await run(["conversions", "update", "abc", "--display-name", "Renamed"]);
    expect(updateConversionSource).toHaveBeenCalledWith(
      "abc",
      { merchantCenterDestination: { displayName: "Renamed" } },
      { updateMask: "merchantCenterDestination.displayName" },
    );
    expect(out()).toContain("Updated conversion source abc");
  });

  it("updates display name + currency together with a combined nested mask", async () => {
    updateConversionSource.mockResolvedValue({});
    await run(["conversions", "update", "abc", "--display-name", "Renamed", "--currency", "EUR"]);
    expect(updateConversionSource).toHaveBeenCalledWith(
      "abc",
      { merchantCenterDestination: { displayName: "Renamed", currencyCode: "EUR" } },
      {
        updateMask: "merchantCenterDestination.displayName,merchantCenterDestination.currencyCode",
      },
    );
  });

  it("updates from --file, honoring an explicit --update-mask", async () => {
    const file = join(dir, "patch.json");
    writeFileSync(
      file,
      JSON.stringify({ merchantCenterDestination: { currencyCode: "GBP", displayName: "X" } }),
    );
    updateConversionSource.mockResolvedValue({});
    await run([
      "conversions",
      "update",
      "abc",
      "--file",
      file,
      "--update-mask",
      "merchantCenterDestination.currencyCode",
    ]);
    expect(updateConversionSource).toHaveBeenCalledWith(
      "abc",
      { merchantCenterDestination: { currencyCode: "GBP", displayName: "X" } },
      { updateMask: "merchantCenterDestination.currencyCode" },
    );
  });

  it("rejects an update with no fields (exit 2)", async () => {
    await run(["conversions", "update", "abc"]);
    expect(updateConversionSource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("archives (deletes) a source and emits JSON", async () => {
    deleteConversionSource.mockResolvedValue(undefined);
    await run(["-j", "conversions", "delete", "accounts/123/conversionSources/abc"]);
    expect(deleteConversionSource).toHaveBeenCalledWith("accounts/123/conversionSources/abc");
    expect(JSON.parse(out())).toEqual({ deleted: "abc" });
  });

  it("undeletes (restores) a source", async () => {
    undeleteConversionSource.mockResolvedValue({ name: "accounts/123/conversionSources/abc" });
    await run(["conversions", "undelete", "abc"]);
    expect(undeleteConversionSource).toHaveBeenCalledWith("abc");
    expect(out()).toContain("Restored conversion source abc");
  });
});
