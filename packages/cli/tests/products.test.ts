import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { Readable } from "node:stream";

const getProduct = vi.fn();
const listProducts = vi.fn();
const insertProductInput = vi.fn();
const deleteProductInput = vi.fn();
// Captures the options each MerchantClient is built with, to assert the scoped
// (accountId-bearing) client the products commands rely on.
const merchantClientOptions: unknown[] = [];

vi.mock("@gmc-cli/auth", () => ({
  resolveAuth: vi.fn(async () => ({
    getAccessToken: async () => "tok",
    getClientEmail: () => "e",
    getProjectId: () => undefined,
  })),
}));

vi.mock("@gmc-cli/api", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/api")>();
  return {
    ...actual,
    MerchantClient: class {
      constructor(options: unknown) {
        merchantClientOptions.push(options);
      }
    },
    ProductsService: class {
      getProduct = getProduct;
      listProducts = listProducts;
      insertProductInput = insertProductInput;
      deleteProductInput = deleteProductInput;
    },
  };
});

import { createProgram } from "../src/program.js";
import { MerchantApiError } from "@gmc-cli/api";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

function tmpFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "gmc-test-"));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

describe("gmc products", () => {
  let writes: string[];
  let errs: string[];
  let savedEnv: Record<string, string | undefined>;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    merchantClientOptions.length = 0;
    process.exitCode = 0;
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-products-test-no-config");
    process.env["GMC_ACCOUNT_ID"] = "123";
    writes = [];
    errs = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      errs.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = 0;
  });

  it("list --json emits a { products } envelope", async () => {
    listProducts.mockResolvedValue([
      { name: "accounts/123/products/online~en~US~SKU1", offerId: "SKU1" },
    ]);

    await run(["products", "list", "--json"]);

    const out = JSON.parse(writes.join("")) as { products: { offerId: string }[] };
    expect(out.products[0]?.offerId).toBe("SKU1");
    // Products build a client scoped to the account (so the service can use
    // client.accountResource), unlike the unscoped accounts client.
    expect(merchantClientOptions.at(-1)).toMatchObject({ accountId: "123" });
    expect(process.exitCode).toBe(0);
  });

  it("list (text) renders title, availability, and the disapproved/issue counts", async () => {
    listProducts.mockResolvedValue([
      {
        name: "accounts/123/products/en~US~SKU1",
        offerId: "SKU1",
        productAttributes: { title: "Trail Runner", availability: "in_stock" },
        productStatus: {
          itemLevelIssues: [
            { code: "x", severity: "DISAPPROVED", reportingContext: "SHOPPING_ADS" },
            { code: "y", severity: "NOT_IMPACTED", reportingContext: "FREE_LISTINGS" },
          ],
        },
      },
    ]);

    await run(["products", "list"]);

    const out = writes.join("");
    expect(out).toContain("Trail Runner");
    expect(out).toContain("[in_stock]");
    expect(out).toContain("1 disapproved / 2 issue(s)");
  });

  it("get fetches the product by id", async () => {
    getProduct.mockResolvedValue({
      name: "accounts/123/products/online~en~US~SKU1",
      offerId: "SKU1",
      productAttributes: { title: "Shoe" },
    });

    await run(["products", "get", "online~en~US~SKU1", "--json"]);

    expect(getProduct).toHaveBeenCalledWith("online~en~US~SKU1");
    const out = JSON.parse(writes.join("")) as { offerId: string };
    expect(out.offerId).toBe("SKU1");
  });

  it("insert reads a ProductInput from --file and posts it with the data source", async () => {
    insertProductInput.mockResolvedValue({
      name: "accounts/123/productInputs/online~en~US~SKU1",
      offerId: "SKU1",
    });
    const file = tmpFile(
      "gmc-prod-insert.json",
      JSON.stringify({ offerId: "SKU1", productAttributes: { title: "Shoe" } }),
    );

    try {
      await run(["products", "insert", "--data-source", "55", "--file", file, "--json"]);
    } finally {
      rmSync(file, { force: true });
    }

    expect(insertProductInput).toHaveBeenCalledWith(
      { offerId: "SKU1", productAttributes: { title: "Shoe" } },
      "55",
    );
    expect(process.exitCode).toBe(0);
  });

  it("insert reads a ProductInput from stdin when no --file is given", async () => {
    insertProductInput.mockResolvedValue({
      name: "accounts/123/productInputs/online~en~US~SKU9",
      offerId: "SKU9",
    });
    const stdin = Readable.from([Buffer.from(JSON.stringify({ offerId: "SKU9" }))]);
    const original = Object.getOwnPropertyDescriptor(process, "stdin");
    Object.defineProperty(process, "stdin", { value: stdin, configurable: true });

    try {
      await run(["products", "insert", "--data-source", "55", "--json"]);
    } finally {
      if (original) Object.defineProperty(process, "stdin", original);
    }

    expect(insertProductInput).toHaveBeenCalledWith({ offerId: "SKU9" }, "55");
    expect(process.exitCode).toBe(0);
  });

  it("insert without --data-source exits 2", async () => {
    const file = tmpFile("gmc-prod-nods.json", JSON.stringify({ offerId: "SKU1" }));

    try {
      await run(["products", "insert", "--file", file]);
    } finally {
      rmSync(file, { force: true });
    }

    expect(insertProductInput).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("--data-source is required");
    expect(process.exitCode).toBe(2);
  });

  it("insert with invalid JSON exits 2", async () => {
    const file = tmpFile("gmc-prod-bad.json", "{ not json ");

    try {
      await run(["products", "insert", "--data-source", "55", "--file", file]);
    } finally {
      rmSync(file, { force: true });
    }

    expect(insertProductInput).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("delete removes the product input and reports it in --json", async () => {
    deleteProductInput.mockResolvedValue(undefined);

    await run(["products", "delete", "online~en~US~SKU1", "--data-source", "55", "--json"]);

    expect(deleteProductInput).toHaveBeenCalledWith("online~en~US~SKU1", "55");
    const out = JSON.parse(writes.join("")) as { deleted: string };
    expect(out.deleted).toBe("online~en~US~SKU1");
    expect(process.exitCode).toBe(0);
  });

  it("exits 2 when no account is configured", async () => {
    delete process.env["GMC_ACCOUNT_ID"];

    await run(["products", "list"]);

    expect(listProducts).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("No Merchant Center account id");
    expect(process.exitCode).toBe(2);
  });

  it("exits 5 when the Merchant API rejects the request", async () => {
    getProduct.mockRejectedValue(new MerchantApiError("Not found (404).", 404, "NOT_FOUND", false));

    await run(["products", "get", "online~en~US~SKU1", "--json"]);

    const out = JSON.parse(writes.join("")) as { ok: boolean };
    expect(out.ok).toBe(false);
    expect(process.exitCode).toBe(5);
  });
});
