import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

const { resolveAuth, listLocal, insertLocal, deleteLocal, listRegional, insertRegional, deleteRegional } =
  vi.hoisted(() => ({
    resolveAuth: vi.fn(),
    listLocal: vi.fn(),
    insertLocal: vi.fn(),
    deleteLocal: vi.fn(),
    listRegional: vi.fn(),
    insertRegional: vi.fn(),
    deleteRegional: vi.fn(),
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
      constructor(_options: unknown) {}
    },
    InventoriesService: class {
      listLocal = listLocal;
      insertLocal = insertLocal;
      deleteLocal = deleteLocal;
      listRegional = listRegional;
      insertRegional = insertRegional;
      deleteRegional = deleteRegional;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

const PROD = "online~en~US~SKU1";

describe("gmc inventory", () => {
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-inv-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-inv-"));
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

  it("inserts a local inventory from flags only", async () => {
    insertLocal.mockResolvedValue({ storeCode: "S1" });
    await run([
      "inventory", "local", "insert", PROD,
      "--store-code", "S1", "--availability", "out_of_stock", "--quantity", "0",
    ]);
    expect(insertLocal).toHaveBeenCalledWith(PROD, {
      storeCode: "S1",
      availability: "out_of_stock",
      quantity: "0",
    });
    expect(out()).toContain("Set local inventory for store S1");
    expect(process.exitCode).toBe(0);
  });

  it("converts --price to micros with --currency", async () => {
    insertLocal.mockResolvedValue({});
    await run([
      "inventory", "local", "insert", PROD,
      "--store-code", "S1", "--price", "19.99", "--currency", "USD",
    ]);
    expect(insertLocal).toHaveBeenCalledWith(PROD, {
      storeCode: "S1",
      price: { amountMicros: "19990000", currencyCode: "USD" },
    });
  });

  it("inherits price.currencyCode from --file when --currency is omitted", async () => {
    const file = join(dir, "li.json");
    writeFileSync(file, JSON.stringify({ storeCode: "S1", price: { currencyCode: "EUR" } }));
    insertLocal.mockResolvedValue({});
    await run(["inventory", "local", "insert", PROD, "--file", file, "--price", "9.99"]);
    expect(insertLocal).toHaveBeenCalledWith(PROD, {
      storeCode: "S1",
      price: { amountMicros: "9990000", currencyCode: "EUR" },
    });
  });

  it("overlays flags on a --file JSON base", async () => {
    const file = join(dir, "li.json");
    writeFileSync(file, JSON.stringify({ storeCode: "S0", pickupMethod: "ship" }));
    insertLocal.mockResolvedValue({});
    await run(["inventory", "local", "insert", PROD, "--file", file, "--availability", "in_stock"]);
    expect(insertLocal).toHaveBeenCalledWith(PROD, {
      storeCode: "S0",
      pickupMethod: "ship",
      availability: "in_stock",
    });
  });

  it("requires --store-code (or storeCode in the file) for local insert", async () => {
    await run(["inventory", "local", "insert", PROD, "--availability", "in_stock"]);
    expect(insertLocal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects a non-integer --quantity", async () => {
    await run(["inventory", "local", "insert", PROD, "--store-code", "S1", "--quantity", "lots"]);
    expect(insertLocal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("lists local inventories and renders them", async () => {
    listLocal.mockResolvedValue([
      { storeCode: "S1", availability: "in_stock", quantity: "5" },
      { storeCode: "S2", availability: "out_of_stock" },
    ]);
    await run(["inventory", "local", "list", PROD]);
    expect(listLocal).toHaveBeenCalledWith(PROD);
    expect(out()).toContain("2 local inventory(ies)");
    expect(out()).toContain("S1");
    expect(out()).toContain("qty 5");
  });

  it("emits JSON for local list", async () => {
    listLocal.mockResolvedValue([{ storeCode: "S1" }]);
    await run(["-j", "inventory", "local", "list", PROD]);
    expect(JSON.parse(out())).toEqual({ localInventories: [{ storeCode: "S1" }] });
  });

  it("deletes a local inventory by store code", async () => {
    deleteLocal.mockResolvedValue(undefined);
    await run(["inventory", "local", "delete", PROD, "--store-code", "S1"]);
    expect(deleteLocal).toHaveBeenCalledWith(PROD, "S1");
    expect(out()).toContain("Deleted local inventory for store S1");
  });

  it("requires --store-code for local delete", async () => {
    await run(["inventory", "local", "delete", PROD]);
    expect(deleteLocal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("inserts a regional inventory and requires a region", async () => {
    insertRegional.mockResolvedValue({});
    await run(["inventory", "regional", "insert", PROD, "--region", "US-CA", "--availability", "in_stock"]);
    expect(insertRegional).toHaveBeenCalledWith(PROD, { region: "US-CA", availability: "in_stock" });

    await run(["inventory", "regional", "insert", PROD, "--availability", "in_stock"]);
    expect(process.exitCode).toBe(2);
  });

  it("errors on --price without a currency", async () => {
    await run(["inventory", "regional", "insert", PROD, "--region", "US-CA", "--price", "9.99"]);
    expect(insertRegional).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("deletes a regional inventory by region", async () => {
    deleteRegional.mockResolvedValue(undefined);
    await run(["inventory", "regional", "delete", PROD, "--region", "US-CA"]);
    expect(deleteRegional).toHaveBeenCalledWith(PROD, "US-CA");
  });
});
