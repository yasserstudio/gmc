import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { resolveAuth, search } = vi.hoisted(() => ({ resolveAuth: vi.fn(), search: vi.fn() }));

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
    ReportsService: class {
      search = search;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc reports", () => {
  let writes: string[];
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-reports-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "123";
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
    for (const key of ENV) {
      const v = savedEnv[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  const out = (): string => writes.join("");

  it("runs an arbitrary MCQL query and prints rows + count", async () => {
    search.mockResolvedValue([{ productPerformanceView: { clicks: "5" } }]);
    await run(["reports", "query", "SELECT product_performance_view.clicks FROM product_performance_view"]);
    expect(search).toHaveBeenCalledWith(
      "SELECT product_performance_view.clicks FROM product_performance_view",
      {},
    );
    expect(out()).toContain('"clicks":"5"');
    expect(out()).toContain("1 row(s).");
  });

  it("emits JSON for query", async () => {
    search.mockResolvedValue([{ productPerformanceView: { clicks: "5" } }]);
    await run(["-j", "reports", "query", "SELECT x FROM y"]);
    expect(JSON.parse(out())).toEqual({ results: [{ productPerformanceView: { clicks: "5" } }] });
  });

  it("builds a bare-column MCQL query for the given window", async () => {
    search.mockResolvedValue([]);
    await run(["reports", "performance", "--since", "2026-05-01", "--until", "2026-05-31"]);
    const q = search.mock.calls[0][0] as string;
    expect(q).toContain("FROM product_performance_view");
    expect(q).toContain("SELECT date, clicks, impressions, click_through_rate, conversions, conversion_value");
    expect(q).toContain("WHERE date BETWEEN '2026-05-01' AND '2026-05-31'");
    // MCQL uses bare column names — the GAQL `view.column` form must NOT appear.
    expect(q).not.toContain("product_performance_view.clicks");
    expect(q).not.toContain("conversion_value_micros");
  });

  it("renders a performance table sorted by date", async () => {
    search.mockResolvedValue([
      { productPerformanceView: { date: { year: 2026, month: 5, day: 2 }, clicks: "10", impressions: "100", clickThroughRate: 0.1 } },
      { productPerformanceView: { date: { year: 2026, month: 5, day: 1 }, clicks: "3", impressions: "50", clickThroughRate: 0.06 } },
    ]);
    await run(["reports", "performance", "--since", "2026-05-01", "--until", "2026-05-02"]);
    const text = out();
    expect(text).toContain("2026-05-01");
    expect(text).toContain("10.00%");
    expect(text.indexOf("2026-05-01")).toBeLessThan(text.indexOf("2026-05-02")); // sorted
  });

  it("defaults to a 30-day window ending today", async () => {
    search.mockResolvedValue([]);
    await run(["reports", "performance"]);
    const q = search.mock.calls[0][0] as string;
    // 30-day inclusive window → two distinct ISO dates present
    expect(q).toMatch(/BETWEEN '\d{4}-\d{2}-\d{2}' AND '\d{4}-\d{2}-\d{2}'/);
  });

  it("rejects a malformed --since date", async () => {
    await run(["reports", "performance", "--since", "May 1"]);
    expect(search).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects a non-positive --days", async () => {
    await run(["reports", "performance", "--days", "0"]);
    expect(search).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("builds a competitive_visibility query with required filters", async () => {
    search.mockResolvedValue([]);
    await run([
      "reports", "competitive-visibility",
      "--country", "us", "--category", "536", "--since", "2026-05-01", "--until", "2026-05-31",
    ]);
    const q = search.mock.calls[0][0] as string;
    expect(q).toContain("FROM competitive_visibility_competitor_view");
    expect(q).toContain("WHERE date BETWEEN '2026-05-01' AND '2026-05-31'");
    expect(q).toContain("report_country_code = 'US'"); // upper-cased
    expect(q).toContain("report_category_id = 536"); // unquoted number
    expect(q).toContain("traffic_source = 'ADS'"); // default
  });

  it("renders competitor rows and marks your domain", async () => {
    search.mockResolvedValue([
      { competitiveVisibilityCompetitorView: { domain: "you.example", isYourDomain: true, rank: "1", relativeVisibility: 0.42 } },
      { competitiveVisibilityCompetitorView: { domain: "rival.example", rank: "2", relativeVisibility: 0.31 } },
    ]);
    await run(["reports", "competitive-visibility", "--country", "US", "--category", "536"]);
    expect(out()).toContain("you.example (you)");
    expect(out()).toContain("42.0%");
  });

  it("requires --country and --category for competitive-visibility", async () => {
    await run(["reports", "competitive-visibility", "--category", "536"]);
    expect(search).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
    await run(["reports", "competitive-visibility", "--country", "US"]);
    expect(process.exitCode).toBe(2);
  });

  it("rejects an invalid --traffic-source", async () => {
    await run(["reports", "competitive-visibility", "--country", "US", "--category", "536", "--traffic-source", "SEO"]);
    expect(search).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("builds a price_competitiveness query, optionally filtered by country", async () => {
    search.mockResolvedValue([]);
    await run(["reports", "price-competitiveness"]);
    expect(search.mock.calls[0][0]).toContain("FROM price_competitiveness_product_view");
    expect(search.mock.calls[0][0]).not.toContain("WHERE");
    search.mockClear();
    await run(["reports", "price-competitiveness", "--country", "US"]);
    expect(search.mock.calls[0][0]).toContain("WHERE report_country_code = 'US'");
  });

  it("renders price vs benchmark", async () => {
    search.mockResolvedValue([
      { priceCompetitivenessProductView: { title: "Shoe", price: { amountMicros: "49990000", currencyCode: "USD" }, benchmarkPrice: { amountMicros: "59990000", currencyCode: "USD" } } },
    ]);
    await run(["reports", "price-competitiveness"]);
    expect(out()).toContain("Shoe");
    expect(out()).toContain("your 49.99 USD vs benchmark 59.99 USD");
  });
});
