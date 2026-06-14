import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

const {
  resolveAuth,
  listStores,
  getStore,
  insertStore,
  deleteStore,
  insertInventory,
  insertSale,
  getMerchantState,
} = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  listStores: vi.fn(),
  getStore: vi.fn(),
  insertStore: vi.fn(),
  deleteStore: vi.fn(),
  insertInventory: vi.fn(),
  insertSale: vi.fn(),
  getMerchantState: vi.fn(),
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
    LfpService: class {
      listStores = listStores;
      getStore = getStore;
      insertStore = insertStore;
      deleteStore = deleteStore;
      insertInventory = insertInventory;
      insertSale = insertSale;
      getMerchantState = getMerchantState;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc lfp", () => {
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-lfp-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "777"; // the provider account
    dir = mkdtempSync(join(tmpdir(), "gmc-lfp-"));
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

  it("lists a merchant's stores (passes the required --target-account)", async () => {
    listStores.mockResolvedValue([
      { name: "accounts/777/lfpStores/m1~s1", storeName: "Shop", matchingState: "MATCHED" },
    ]);
    await run(["lfp", "stores", "list", "--target-account", "123"]);
    expect(listStores).toHaveBeenCalledWith("123");
    expect(out()).toContain("1 store(s)");
    expect(out()).toContain("m1~s1");
    expect(out()).toContain("Shop");
    expect(out()).toContain("MATCHED");
  });

  it("rejects stores list without --target-account (exit 2)", async () => {
    await run(["lfp", "stores", "list"]);
    expect(listStores).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("emits JSON for stores list under an lfpStores envelope", async () => {
    listStores.mockResolvedValue([{ name: "accounts/777/lfpStores/m1~s1" }]);
    await run(["-j", "lfp", "stores", "list", "--target-account", "123"]);
    expect(JSON.parse(out())).toEqual({ lfpStores: [{ name: "accounts/777/lfpStores/m1~s1" }] });
  });

  it("inserts a store with a bare numeric targetAccount (accounts/ prefix stripped)", async () => {
    insertStore.mockResolvedValue({ name: "accounts/777/lfpStores/123~s1" });
    await run([
      "lfp",
      "stores",
      "insert",
      "--target-account",
      "accounts/123",
      "--store-code",
      "s1",
      "--store-name",
      "Shop",
      "--gcid-category",
      "gcid:store, gcid:grocery_store",
    ]);
    expect(insertStore).toHaveBeenCalledWith({
      targetAccount: "123",
      storeCode: "s1",
      storeName: "Shop",
      gcidCategory: ["gcid:store", "gcid:grocery_store"],
    });
  });

  it("rejects a non-numeric --target-account (exit 2)", async () => {
    await run(["lfp", "stores", "insert", "--target-account", "abc", "--store-code", "s1"]);
    expect(insertStore).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects a store insert without --target-account (exit 2)", async () => {
    await run(["lfp", "stores", "insert", "--store-code", "s1"]);
    expect(insertStore).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects a store insert without --store-code (exit 2)", async () => {
    await run(["lfp", "stores", "insert", "--target-account", "123"]);
    expect(insertStore).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("deletes a store and emits JSON", async () => {
    deleteStore.mockResolvedValue(undefined);
    await run(["-j", "lfp", "stores", "delete", "accounts/777/lfpStores/m1~s1"]);
    expect(deleteStore).toHaveBeenCalledWith("accounts/777/lfpStores/m1~s1");
    expect(JSON.parse(out())).toEqual({ deleted: "m1~s1" });
  });

  it("inserts inventory with price → amountMicros and quantity", async () => {
    insertInventory.mockResolvedValue({ name: "accounts/777/lfpInventories/x" });
    await run([
      "lfp",
      "inventory",
      "insert",
      "--target-account",
      "123",
      "--store-code",
      "s1",
      "--offer-id",
      "sku1",
      "--quantity",
      "5",
      "--price",
      "19.99",
      "--currency",
      "USD",
      "--availability",
      "in_stock",
    ]);
    expect(insertInventory).toHaveBeenCalledWith({
      targetAccount: "123",
      storeCode: "s1",
      offerId: "sku1",
      quantity: "5",
      price: { amountMicros: "19990000", currencyCode: "USD" },
      availability: "in_stock",
    });
  });

  it("rejects inventory insert without --offer-id (exit 2)", async () => {
    await run(["lfp", "inventory", "insert", "--target-account", "123", "--store-code", "s1"]);
    expect(insertInventory).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("inserts inventory from --file, overlaying flags", async () => {
    const file = join(dir, "inv.json");
    writeFileSync(file, JSON.stringify({ targetAccount: "123", storeCode: "s1", gtin: "0001" }));
    insertInventory.mockResolvedValue({});
    await run(["lfp", "inventory", "insert", "--file", file, "--offer-id", "sku1"]);
    expect(insertInventory).toHaveBeenCalledWith({
      targetAccount: "123",
      storeCode: "s1",
      gtin: "0001",
      offerId: "sku1",
    });
  });

  it("inserts a sale, allowing a negative quantity (return)", async () => {
    insertSale.mockResolvedValue({ name: "accounts/777/lfpSales/x" });
    await run([
      "lfp",
      "sales",
      "insert",
      "--target-account",
      "123",
      "--store-code",
      "s1",
      "--offer-id",
      "sku1",
      "--quantity",
      "-1",
      "--sale-time",
      "2026-06-14T00:00:00Z",
    ]);
    expect(insertSale).toHaveBeenCalledWith({
      targetAccount: "123",
      storeCode: "s1",
      offerId: "sku1",
      quantity: "-1",
      saleTime: "2026-06-14T00:00:00Z",
    });
  });

  it("rejects inventory insert with a negative quantity (exit 2)", async () => {
    await run([
      "lfp",
      "inventory",
      "insert",
      "--target-account",
      "123",
      "--store-code",
      "s1",
      "--offer-id",
      "sku1",
      "--quantity",
      "-1",
    ]);
    expect(insertInventory).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("gets a merchant state by target account", async () => {
    getMerchantState.mockResolvedValue({ name: "accounts/777/lfpMerchantStates/123" });
    await run(["lfp", "state", "get", "123"]);
    expect(getMerchantState).toHaveBeenCalledWith("123");
    expect(out()).toContain("accounts/777/lfpMerchantStates/123");
  });
});
