import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

const { resolveAuth, getPromotion, listPromotions, insertPromotion } = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  getPromotion: vi.fn(),
  listPromotions: vi.fn(),
  insertPromotion: vi.fn(),
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
    PromotionsService: class {
      getPromotion = getPromotion;
      listPromotions = listPromotions;
      insertPromotion = insertPromotion;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc promotions", () => {
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-promo-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-promo-"));
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

  it("lists promotions", async () => {
    listPromotions.mockResolvedValue([
      { promotionId: "P1", attributes: { longTitle: "20% off", couponValueType: "PERCENT_OFF" } },
    ]);
    await run(["promotions", "list"]);
    expect(out()).toContain("1 promotion(s)");
    expect(out()).toContain("P1");
    expect(out()).toContain("20% off");
  });

  it("emits JSON for list", async () => {
    listPromotions.mockResolvedValue([{ promotionId: "P1" }]);
    await run(["-j", "promotions", "list"]);
    expect(JSON.parse(out())).toEqual({ promotions: [{ promotionId: "P1" }] });
  });

  it("gets one promotion", async () => {
    getPromotion.mockResolvedValue({ promotionId: "P1", attributes: { longTitle: "Sale" }, targetCountry: "US" });
    await run(["promotions", "get", "P1"]);
    expect(getPromotion).toHaveBeenCalledWith("P1");
    expect(out()).toContain("Sale");
    expect(out()).toContain("US");
  });

  it("emits raw JSON for get", async () => {
    getPromotion.mockResolvedValue({ promotionId: "P1", targetCountry: "US" });
    await run(["-j", "promotions", "get", "P1"]);
    expect(JSON.parse(out())).toEqual({ promotionId: "P1", targetCountry: "US" });
  });

  it("inserts a promotion from a file under a data source", async () => {
    const file = join(dir, "p.json");
    writeFileSync(file, JSON.stringify({ promotionId: "P1", contentLanguage: "en", targetCountry: "US" }));
    insertPromotion.mockResolvedValue({ promotionId: "P1" });
    await run(["promotions", "insert", "--data-source", "DS1", "--file", file]);
    expect(insertPromotion).toHaveBeenCalledWith(
      { promotionId: "P1", contentLanguage: "en", targetCountry: "US" },
      "DS1",
    );
    expect(out()).toContain("Inserted promotion P1");
  });

  it("emits raw JSON for insert", async () => {
    const file = join(dir, "p.json");
    writeFileSync(file, JSON.stringify({ promotionId: "P1" }));
    insertPromotion.mockResolvedValue({ promotionId: "P1", name: "accounts/123/promotions/P1" });
    await run(["-j", "promotions", "insert", "--data-source", "DS1", "--file", file]);
    expect(JSON.parse(out())).toEqual({ promotionId: "P1", name: "accounts/123/promotions/P1" });
  });

  it("requires --data-source to insert", async () => {
    const file = join(dir, "p.json");
    writeFileSync(file, JSON.stringify({ promotionId: "P1" }));
    await run(["promotions", "insert", "--file", file]);
    expect(insertPromotion).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });
});
