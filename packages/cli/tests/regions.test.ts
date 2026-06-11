import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

const { resolveAuth, listRegions, getRegion, createRegion, updateRegion, deleteRegion } =
  vi.hoisted(() => ({
    resolveAuth: vi.fn(),
    listRegions: vi.fn(),
    getRegion: vi.fn(),
    createRegion: vi.fn(),
    updateRegion: vi.fn(),
    deleteRegion: vi.fn(),
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
    RegionsService: class {
      listRegions = listRegions;
      getRegion = getRegion;
      createRegion = createRegion;
      updateRegion = updateRegion;
      deleteRegion = deleteRegion;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc regions", () => {
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-regions-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-regions-"));
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

  it("lists regions with an area summary", async () => {
    listRegions.mockResolvedValue([
      {
        name: "accounts/123/regions/usa-ca",
        displayName: "California",
        postalCodeArea: { regionCode: "US", postalCodes: [{ begin: "90000", end: "90999" }] },
      },
    ]);
    await run(["regions", "list"]);
    expect(out()).toContain("1 region(s)");
    expect(out()).toContain("usa-ca");
    expect(out()).toContain("California");
    expect(out()).toContain("postal code(s) in US");
  });

  it("emits JSON for list", async () => {
    listRegions.mockResolvedValue([{ name: "accounts/123/regions/r1" }]);
    await run(["-j", "regions", "list"]);
    expect(JSON.parse(out())).toEqual({ regions: [{ name: "accounts/123/regions/r1" }] });
  });

  it("gets one region and shows eligibility", async () => {
    getRegion.mockResolvedValue({
      name: "accounts/123/regions/usa-ca",
      displayName: "California",
      geotargetArea: { geotargetCriteriaIds: ["21137"] },
      regionalInventoryEligible: true,
      shippingEligible: false,
    });
    await run(["regions", "get", "usa-ca"]);
    expect(getRegion).toHaveBeenCalledWith("usa-ca");
    expect(out()).toContain("California");
    expect(out()).toContain("eligible");
  });

  it("creates a region from --postal-codes + --region-code", async () => {
    createRegion.mockResolvedValue({ name: "accounts/123/regions/usa-ca" });
    await run([
      "regions",
      "create",
      "usa-ca",
      "--display-name",
      "California",
      "--region-code",
      "US",
      "--postal-codes",
      "90000-90999,94000",
    ]);
    expect(createRegion).toHaveBeenCalledWith("usa-ca", {
      displayName: "California",
      postalCodeArea: {
        regionCode: "US",
        postalCodes: [{ begin: "90000", end: "90999" }, { begin: "94000" }],
      },
    });
    expect(out()).toContain("Created region usa-ca");
  });

  it("creates a region from --geotarget-ids", async () => {
    createRegion.mockResolvedValue({ name: "accounts/123/regions/geo" });
    await run(["regions", "create", "geo", "--geotarget-ids", "21137, 21138"]);
    expect(createRegion).toHaveBeenCalledWith("geo", {
      geotargetArea: { geotargetCriteriaIds: ["21137", "21138"] },
    });
  });

  it("requires an area definition on create", async () => {
    await run(["regions", "create", "x", "--display-name", "No area"]);
    expect(createRegion).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects --postal-codes without --region-code", async () => {
    await run(["regions", "create", "x", "--postal-codes", "90000"]);
    expect(createRegion).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects two area types at once", async () => {
    await run([
      "regions",
      "create",
      "x",
      "--region-code",
      "US",
      "--postal-codes",
      "90000",
      "--geotarget-ids",
      "21137",
    ]);
    expect(createRegion).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("updates a region with just --display-name", async () => {
    updateRegion.mockResolvedValue({ name: "accounts/123/regions/usa-ca" });
    await run(["regions", "update", "usa-ca", "--display-name", "Cali"]);
    expect(updateRegion).toHaveBeenCalledWith("usa-ca", { displayName: "Cali" }, {});
    expect(out()).toContain("Updated region usa-ca");
  });

  it("rejects an update with no fields", async () => {
    await run(["regions", "update", "usa-ca"]);
    expect(updateRegion).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("wires --page-size through to listRegions", async () => {
    listRegions.mockResolvedValue([]);
    await run(["regions", "list", "--page-size", "50"]);
    expect(listRegions).toHaveBeenCalledWith({ pageSize: 50 });
  });

  it("rejects an invalid --page-size", async () => {
    await run(["regions", "list", "--page-size", "0"]);
    expect(listRegions).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("strips output-only fields from a --file body on update", async () => {
    const file = join(dir, "r.json");
    writeFileSync(
      file,
      JSON.stringify({
        name: "accounts/123/regions/usa-ca",
        displayName: "Cali",
        geotargetArea: { geotargetCriteriaIds: ["21137"] },
        regionalInventoryEligible: true,
        shippingEligible: false,
      }),
    );
    updateRegion.mockResolvedValue({ name: "accounts/123/regions/usa-ca" });
    await run(["regions", "update", "usa-ca", "--file", file]);
    expect(updateRegion).toHaveBeenCalledWith(
      "usa-ca",
      { displayName: "Cali", geotargetArea: { geotargetCriteriaIds: ["21137"] } },
      {},
    );
  });

  it("passes an explicit --update-mask through", async () => {
    updateRegion.mockResolvedValue({});
    await run([
      "regions",
      "update",
      "usa-ca",
      "--display-name",
      "Cali",
      "--update-mask",
      "displayName",
    ]);
    expect(updateRegion).toHaveBeenCalledWith(
      "usa-ca",
      { displayName: "Cali" },
      { updateMask: "displayName" },
    );
  });

  it("rejects --region-code without --postal-codes", async () => {
    await run(["regions", "create", "x", "--region-code", "US", "--geotarget-ids", "21137"]);
    expect(createRegion).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects a malformed multi-hyphen postal range", async () => {
    await run([
      "regions",
      "create",
      "x",
      "--region-code",
      "US",
      "--postal-codes",
      "10001-10005-99",
    ]);
    expect(createRegion).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("deletes a region and emits JSON", async () => {
    deleteRegion.mockResolvedValue(undefined);
    await run(["-j", "regions", "delete", "accounts/123/regions/usa-ca"]);
    expect(deleteRegion).toHaveBeenCalledWith("accounts/123/regions/usa-ca");
    expect(JSON.parse(out())).toEqual({ deleted: "usa-ca" });
  });
});
