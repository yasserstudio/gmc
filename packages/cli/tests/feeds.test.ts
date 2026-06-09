import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const listProducts = vi.fn();
const insertProductInput = vi.fn();

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
      constructor(_options: unknown) {}
    },
    ProductsService: class {
      listProducts = listProducts;
      insertProductInput = insertProductInput;
    },
  };
});

import { createProgram } from "../src/program.js";
import { MerchantApiError } from "@gmc-cli/api";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc feeds pull", () => {
  let writes: string[];
  let errs: string[];
  let savedEnv: Record<string, string | undefined>;
  let dir: string;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-feeds-test-no-config");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-feeds-"));
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
    rmSync(dir, { recursive: true, force: true });
    for (const key of ENV) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = 0;
  });

  it("writes one push-ready file per product", async () => {
    listProducts.mockResolvedValue([
      {
        name: "accounts/123/products/online~en~US~SKU1",
        offerId: "SKU1",
        attributes: { title: "A" },
        productStatus: { itemLevelIssues: [] },
      },
      { name: "accounts/123/products/online~en~US~SKU2", offerId: "SKU2", attributes: { title: "B" } },
    ]);

    await run(["feeds", "pull", "--dir", dir, "--json"]);

    const out = JSON.parse(writes.join("")) as { pulled: number; dir: string; skipped?: number };
    expect(out.pulled).toBe(2);
    expect(out.dir).toBe(dir);
    expect("skipped" in out).toBe(false);
    expect(readdirSync(dir).sort()).toEqual(["online~en~US~SKU1.json", "online~en~US~SKU2.json"]);

    const f1 = JSON.parse(readFileSync(join(dir, "online~en~US~SKU1.json"), "utf8")) as Record<string, unknown>;
    expect(f1).toEqual({ offerId: "SKU1", attributes: { title: "A" } });
    expect("productStatus" in f1).toBe(false);
    expect("name" in f1).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  it("passes --page-size through to the API", async () => {
    listProducts.mockResolvedValue([]);
    await run(["feeds", "pull", "--dir", dir, "--page-size", "50"]);
    expect(listProducts).toHaveBeenCalledWith({ pageSize: 50 });
    expect(process.exitCode).toBe(0);
  });

  it("sanitizes path-unsafe characters in the filename", async () => {
    listProducts.mockResolvedValue([
      { name: "accounts/123/products/online~en~US~A:B", offerId: "A:B", attributes: {} },
    ]);
    await run(["feeds", "pull", "--dir", dir]);
    expect(readdirSync(dir)).toEqual(["online~en~US~A_B.json"]);
    expect(process.exitCode).toBe(0);
  });

  it("skips a product with no derivable id", async () => {
    listProducts.mockResolvedValue([{ name: "", offerId: "" }]);
    await run(["feeds", "pull", "--dir", dir, "--json"]);
    const out = JSON.parse(writes.join("")) as { pulled: number; skipped?: number };
    expect(out.pulled).toBe(0);
    expect(out.skipped).toBe(1);
    expect(readdirSync(dir)).toEqual([]);
    expect(process.exitCode).toBe(0);
  });

  it("skips a colliding filename instead of overwriting", async () => {
    listProducts.mockResolvedValue([
      { name: "accounts/123/products/online~en~US~A:B", attributes: { title: "first" } },
      { name: "accounts/123/products/online~en~US~A_B", attributes: { title: "second" } },
    ]);
    await run(["feeds", "pull", "--dir", dir, "--json"]);
    const out = JSON.parse(writes.join("")) as { pulled: number; skipped?: number };
    expect(out.pulled).toBe(1);
    expect(out.skipped).toBe(1);
    expect(readdirSync(dir)).toEqual(["online~en~US~A_B.json"]);
    const written = JSON.parse(readFileSync(join(dir, "online~en~US~A_B.json"), "utf8")) as {
      attributes: { title: string };
    };
    expect(written.attributes.title).toBe("first");
    expect(process.exitCode).toBe(0);
  });

  it("handles an empty catalog (0 files, exit 0)", async () => {
    listProducts.mockResolvedValue([]);

    await run(["feeds", "pull", "--dir", dir]);

    expect(readdirSync(dir)).toEqual([]);
    expect(writes.join("")).toContain("Pulled 0 product(s)");
    expect(process.exitCode).toBe(0);
  });

  it("exits 2 when no account is configured", async () => {
    delete process.env["GMC_ACCOUNT_ID"];

    await run(["feeds", "pull", "--dir", dir]);

    expect(listProducts).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("No Merchant Center account id");
    expect(process.exitCode).toBe(2);
  });

  it("exits 5 when the Merchant API rejects the request", async () => {
    listProducts.mockRejectedValue(new MerchantApiError("Forbidden (403).", 403, "DENIED", false));

    await run(["feeds", "pull", "--dir", dir, "--json"]);

    const out = JSON.parse(writes.join("")) as { ok: boolean };
    expect(out.ok).toBe(false);
    expect(process.exitCode).toBe(5);
  });
});

describe("gmc feeds push", () => {
  let writes: string[];
  let errs: string[];
  let savedEnv: Record<string, string | undefined>;
  let dir: string;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    insertProductInput.mockResolvedValue({});
    process.exitCode = 0;
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-feeds-test-no-config");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-push-"));
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
    rmSync(dir, { recursive: true, force: true });
    for (const key of ENV) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = 0;
  });

  it("inserts one product input per JSON file, under the given data source", async () => {
    writeFileSync(join(dir, "a.json"), JSON.stringify({ offerId: "SKU1", attributes: { title: "A" } }));
    writeFileSync(join(dir, "b.json"), JSON.stringify({ offerId: "SKU2", attributes: { title: "B" } }));

    await run(["feeds", "push", "--dir", dir, "--data-source", "55", "--json"]);

    const out = JSON.parse(writes.join("")) as { pushed: number; dataSource: string; failed?: number };
    expect(out.pushed).toBe(2);
    expect(out.dataSource).toBe("55");
    expect("failed" in out).toBe(false);
    expect(insertProductInput).toHaveBeenCalledTimes(2);
    expect(insertProductInput).toHaveBeenCalledWith({ offerId: "SKU1", attributes: { title: "A" } }, "55");
    expect(process.exitCode).toBe(0);
  });

  it("only reads .json files (ignores other files)", async () => {
    writeFileSync(join(dir, "keep.json"), JSON.stringify({ offerId: "SKU1" }));
    writeFileSync(join(dir, "README.txt"), "not a product");
    writeFileSync(join(dir, ".DS_Store"), "junk");

    await run(["feeds", "push", "--dir", dir, "--data-source", "55", "--json"]);

    const out = JSON.parse(writes.join("")) as { pushed: number };
    expect(out.pushed).toBe(1);
    expect(insertProductInput).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  it("requires --data-source (exit 2)", async () => {
    writeFileSync(join(dir, "a.json"), JSON.stringify({ offerId: "SKU1" }));

    await run(["feeds", "push", "--dir", dir]);

    expect(insertProductInput).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("--data-source is required");
    expect(process.exitCode).toBe(2);
  });

  it("exits 2 when the directory cannot be read", async () => {
    await run(["feeds", "push", "--dir", join(dir, "does-not-exist"), "--data-source", "55"]);

    expect(insertProductInput).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("Could not read feed directory");
    expect(process.exitCode).toBe(2);
  });

  it("skips a malformed file, pushes the rest, and exits 1", async () => {
    writeFileSync(join(dir, "good.json"), JSON.stringify({ offerId: "SKU1" }));
    writeFileSync(join(dir, "bad.json"), "{ not valid json");
    writeFileSync(join(dir, "array.json"), JSON.stringify([1, 2, 3]));

    await run(["feeds", "push", "--dir", dir, "--data-source", "55", "--json"]);

    const out = JSON.parse(writes.join("")) as {
      pushed: number;
      failed?: number;
      failures?: { file: string }[];
    };
    expect(out.pushed).toBe(1);
    expect(out.failed).toBe(2);
    expect((out.failures ?? []).map((f) => f.file).sort()).toEqual(["array.json", "bad.json"]);
    expect(insertProductInput).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  it("pushes nothing from an empty directory (exit 0)", async () => {
    await run(["feeds", "push", "--dir", dir, "--data-source", "55"]);

    expect(insertProductInput).not.toHaveBeenCalled();
    expect(writes.join("")).toContain("Pushed 0 product(s)");
    expect(process.exitCode).toBe(0);
  });

  it("aborts after the first failed insert (exit 5), not pushing the rest", async () => {
    writeFileSync(join(dir, "a.json"), JSON.stringify({ offerId: "SKU1" }));
    writeFileSync(join(dir, "b.json"), JSON.stringify({ offerId: "SKU2" }));
    insertProductInput.mockRejectedValue(new MerchantApiError("Forbidden (403).", 403, "DENIED", false));

    await run(["feeds", "push", "--dir", dir, "--data-source", "55", "--json"]);

    const out = JSON.parse(writes.join("")) as { ok: boolean };
    expect(out.ok).toBe(false);
    // The run aborts on the first rejection rather than attempting every file.
    expect(insertProductInput).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(5);
  });
});

describe("gmc feeds diff", () => {
  let writes: string[];
  let errs: string[];
  let savedEnv: Record<string, string | undefined>;
  let dir: string;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  // A processed product as `products.list` returns it; `toProductInput` strips it
  // to the writable shape a pulled file holds.
  const product = (offerId: string, title: string) => ({
    name: `accounts/123/products/online~en~US~${offerId}`,
    offerId,
    channel: "ONLINE",
    contentLanguage: "en",
    feedLabel: "US",
    attributes: { title },
  });
  // The pulled-file equivalent of the product above (key fields + attributes).
  const file = (offerId: string, title: string) => ({
    offerId,
    contentLanguage: "en",
    feedLabel: "US",
    channel: "ONLINE",
    attributes: { title },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-feeds-test-no-config");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-diff-"));
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
    rmSync(dir, { recursive: true, force: true });
    for (const key of ENV) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = 0;
  });

  it("categorizes added / updated / unchanged / orphaned against the catalog", async () => {
    listProducts.mockResolvedValue([product("SKU1", "A"), product("SKU2", "B"), product("SKU4", "D")]);
    writeFileSync(join(dir, "unchanged.json"), JSON.stringify(file("SKU1", "A"))); // matches SKU1
    writeFileSync(join(dir, "updated.json"), JSON.stringify(file("SKU2", "B-EDIT"))); // differs from SKU2
    writeFileSync(join(dir, "added.json"), JSON.stringify(file("SKU3", "C"))); // not in catalog
    // SKU4 has no local file → orphaned.

    await run(["feeds", "diff", "--dir", dir, "--json"]);

    const out = JSON.parse(writes.join("")) as {
      added: string[];
      updated: string[];
      unchanged: number;
      orphaned: string[];
    };
    expect(out.added).toEqual(["ONLINE~en~US~SKU3"]);
    expect(out.updated).toEqual(["ONLINE~en~US~SKU2"]);
    expect(out.unchanged).toBe(1);
    expect(out.orphaned).toEqual(["ONLINE~en~US~SKU4"]);
    expect(process.exitCode).toBe(0);
  });

  it("scopes the comparison to a data source when --data-source is given", async () => {
    listProducts.mockResolvedValue([
      { ...product("SKU1", "A"), dataSource: "accounts/123/dataSources/100" },
      { ...product("SKU2", "B"), dataSource: "accounts/123/dataSources/200" },
    ]);
    writeFileSync(join(dir, "in-source.json"), JSON.stringify(file("SKU1", "A"))); // matches, source 100
    writeFileSync(join(dir, "other-source.json"), JSON.stringify(file("SKU2", "B"))); // lives in 200

    await run(["feeds", "diff", "--dir", dir, "--data-source", "100", "--json"]);

    const out = JSON.parse(writes.join("")) as {
      added: string[];
      unchanged: number;
      orphaned: string[];
      dataSource: string;
    };
    // SKU2 belongs to source 200, so against source 100 it reads as "added", not matched.
    expect(out.added).toEqual(["ONLINE~en~US~SKU2"]);
    expect(out.unchanged).toBe(1);
    expect(out.orphaned).toEqual([]);
    expect(out.dataSource).toBe("100");
    expect(process.exitCode).toBe(0);
  });

  it("reports no changes when the directory matches the catalog (key order ignored)", async () => {
    listProducts.mockResolvedValue([product("SKU1", "A"), product("SKU2", "B")]);
    // Same content, deliberately different key order — stable compare treats as equal.
    writeFileSync(
      join(dir, "a.json"),
      JSON.stringify({ attributes: { title: "A" }, channel: "ONLINE", feedLabel: "US", contentLanguage: "en", offerId: "SKU1" }),
    );
    writeFileSync(join(dir, "b.json"), JSON.stringify(file("SKU2", "B")));

    await run(["feeds", "diff", "--dir", dir, "--json"]);

    const out = JSON.parse(writes.join("")) as {
      added: string[];
      updated: string[];
      unchanged: number;
      orphaned: string[];
    };
    expect(out.added).toEqual([]);
    expect(out.updated).toEqual([]);
    expect(out.unchanged).toBe(2);
    expect(out.orphaned).toEqual([]);
    expect(process.exitCode).toBe(0);
  });

  it("exits 2 when the directory cannot be read", async () => {
    await run(["feeds", "diff", "--dir", join(dir, "does-not-exist")]);

    expect(listProducts).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("Could not read feed directory");
    expect(process.exitCode).toBe(2);
  });

  it("skips an invalid file (exit 1) but still diffs the rest", async () => {
    listProducts.mockResolvedValue([]); // empty catalog → valid files are all "added"
    writeFileSync(join(dir, "good.json"), JSON.stringify(file("SKU1", "A")));
    writeFileSync(join(dir, "bad.json"), "{ not valid json");

    await run(["feeds", "diff", "--dir", dir, "--json"]);

    const out = JSON.parse(writes.join("")) as { added: string[]; failed?: number };
    expect(out.added).toEqual(["ONLINE~en~US~SKU1"]);
    expect(out.failed).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it("exits 5 when the Merchant API rejects the listing", async () => {
    writeFileSync(join(dir, "a.json"), JSON.stringify(file("SKU1", "A")));
    listProducts.mockRejectedValue(new MerchantApiError("Forbidden (403).", 403, "DENIED", false));

    await run(["feeds", "diff", "--dir", dir, "--json"]);

    const out = JSON.parse(writes.join("")) as { ok: boolean };
    expect(out.ok).toBe(false);
    expect(process.exitCode).toBe(5);
  });
});
