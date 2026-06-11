import type { Command } from "commander";
import { emitJson, reportError, ExitCode, UsageError } from "@gmc-cli/core";
import { ReportsService, type ReportDate, type ReportRow } from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, parsePageSize, formatPrice } from "./_shared.js";

interface PerfOpts {
  days?: string;
  since?: string;
  until?: string;
  pageSize?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` for a Date (UTC). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * True only for a real ISO calendar date — rejects shape-valid-but-impossible
 * values like `2026-13-45` (which `DATE_RE` alone would pass and a raw `Date`
 * would silently roll over).
 */
function isCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoDate(d) === s;
}

/** Format a reports API date object as `YYYY-MM-DD`. */
function fmtReportDate(d?: ReportDate): string {
  if (!d?.year) return "—";
  const m = String(d.month ?? 1).padStart(2, "0");
  const day = String(d.day ?? 1).padStart(2, "0");
  return `${d.year}-${m}-${day}`;
}

/** Resolve the performance window: explicit --since/--until, else the last --days (default 30). */
// Cap on `--days` (~10 years) — generous for any report retention window, but
// bounded so the start date can't underflow into a negative/invalid year.
const MAX_DAYS = 3650;

function resolveWindow(opts: PerfOpts): { since: string; until: string } {
  for (const [flag, val] of [
    ["--since", opts.since],
    ["--until", opts.until],
  ] as const) {
    if (val !== undefined && !isCalendarDate(val)) {
      throw new UsageError(`Invalid ${flag} "${val}".`, "Use a real ISO date, e.g. 2026-05-01.");
    }
  }
  const until = opts.until ?? isoDate(new Date());
  if (opts.since) return { since: opts.since, until };
  let days = 30;
  if (opts.days !== undefined) {
    // Require plain digits (so "1e9" / "1.5" can't slip past Number()) and cap the
    // span — an unbounded value underflows the start date to a negative year.
    const n = Number(opts.days);
    if (!/^\d+$/.test(opts.days) || !Number.isInteger(n) || n <= 0 || n > MAX_DAYS) {
      throw new UsageError(
        `Invalid --days "${opts.days}".`,
        `Use a positive integer up to ${MAX_DAYS}.`,
      );
    }
    days = n;
  }
  const start = new Date(`${until}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { since: isoDate(start), until };
}

// Merchant Center Query Language uses BARE column names (the `view.column` form is
// Google Ads GAQL, which the Merchant API rejects). `conversion_value` is a Price.
const PERFORMANCE_COLUMNS = [
  "date",
  "clicks",
  "impressions",
  "click_through_rate",
  "conversions",
  "conversion_value",
];

function performanceQuery(since: string, until: string): string {
  return (
    `SELECT ${PERFORMANCE_COLUMNS.join(", ")} FROM product_performance_view ` +
    `WHERE date BETWEEN '${since}' AND '${until}'`
  );
}

function pct(rate?: number): string {
  return typeof rate === "number" ? `${(rate * 100).toFixed(2)}%` : "—";
}

function renderPerformance(rows: ReportRow[], since: string, until: string): void {
  process.stdout.write(`product performance · ${since} → ${until}\n`);
  const views = rows
    .map((r) => r.productPerformanceView)
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
  if (views.length === 0) {
    process.stdout.write("No performance data for this window.\n");
    return;
  }
  views.sort((a, b) => fmtReportDate(a.date).localeCompare(fmtReportDate(b.date)));
  process.stdout.write("date        clicks  impressions  ctr      conversions\n");
  for (const v of views) {
    const row =
      `${fmtReportDate(v.date).padEnd(11)} ` +
      `${(v.clicks ?? "0").padStart(6)}  ` +
      `${(v.impressions ?? "0").padStart(11)}  ` +
      `${pct(v.clickThroughRate).padEnd(7)}  ` +
      `${String(v.conversions ?? 0)}`;
    process.stdout.write(`${row}\n`);
  }
}

// competitive_visibility_competitor_view requires date + country + category + traffic_source filters.
const COMPETITOR_COLUMNS = [
  "report_country_code",
  "report_category_id",
  "traffic_source",
  "domain",
  "is_your_domain",
  "rank",
  "ads_organic_ratio",
  "page_overlap_rate",
  "higher_position_rate",
  "relative_visibility",
];
const PRICE_COMPETITIVENESS_COLUMNS = [
  "id",
  "title",
  "brand",
  "price",
  "report_country_code",
  "benchmark_price",
];
const TRAFFIC_SOURCES = new Set(["ADS", "ORGANIC", "ALL"]);

function requireCountry(c?: string): string {
  if (!c || !/^[A-Za-z]{2}$/.test(c)) {
    throw new UsageError(
      `Invalid or missing --country "${c ?? ""}".`,
      "Pass a 2-letter country code, e.g. US.",
    );
  }
  return c.toUpperCase();
}
function requireCategory(c?: string): string {
  if (!c || !/^\d+$/.test(c)) {
    throw new UsageError(
      `Invalid or missing --category "${c ?? ""}".`,
      "Pass a numeric Google product category id, e.g. 536.",
    );
  }
  return c; // a number in MCQL — interpolated unquoted, digits-only so injection-safe
}
function normTrafficSource(s?: string): string {
  const v = (s ?? "ADS").toUpperCase();
  if (!TRAFFIC_SOURCES.has(v)) {
    throw new UsageError(`Invalid --traffic-source "${s}".`, "Use ADS, ORGANIC, or ALL.");
  }
  return v;
}

function competitiveVisibilityQuery(
  country: string,
  category: string,
  trafficSource: string,
  since: string,
  until: string,
): string {
  return (
    `SELECT ${COMPETITOR_COLUMNS.join(", ")} FROM competitive_visibility_competitor_view ` +
    `WHERE date BETWEEN '${since}' AND '${until}' ` +
    `AND report_country_code = '${country}' AND report_category_id = ${category} ` +
    `AND traffic_source = '${trafficSource}'`
  );
}
function priceCompetitivenessQuery(country?: string): string {
  let q = `SELECT ${PRICE_COMPETITIVENESS_COLUMNS.join(", ")} FROM price_competitiveness_product_view`;
  if (country) q += ` WHERE report_country_code = '${country}'`;
  return q;
}

function ratioPct(r?: number): string {
  return typeof r === "number" ? `${(r * 100).toFixed(1)}%` : "—";
}

function renderCompetitiveVisibility(rows: ReportRow[]): void {
  const views = rows
    .map((r) => r.competitiveVisibilityCompetitorView)
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
  if (views.length === 0) {
    process.stdout.write("No competitive visibility data.\n");
    return;
  }
  process.stdout.write(`${views.length} competitor row(s):\n`);
  process.stdout.write("rank  domain                          rel.vis  overlap  higher-pos\n");
  for (const v of views) {
    const you = v.isYourDomain ? " (you)" : "";
    const domain = `${v.domain ?? "—"}${you}`.padEnd(30);
    process.stdout.write(
      `${String(v.rank ?? "—").padStart(4)}  ${domain}  ` +
        `${ratioPct(v.relativeVisibility).padEnd(7)}  ${ratioPct(v.pageOverlapRate).padEnd(7)}  ` +
        `${ratioPct(v.higherPositionRate)}\n`,
    );
  }
}

function renderPriceCompetitiveness(rows: ReportRow[]): void {
  const views = rows
    .map((r) => r.priceCompetitivenessProductView)
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
  if (views.length === 0) {
    process.stdout.write("No price competitiveness data.\n");
    return;
  }
  process.stdout.write(`${views.length} product(s):\n`);
  for (const v of views) {
    const label = v.title ?? v.id ?? "—";
    const price = v.price ? formatPrice(v.price) : "—";
    const bench = v.benchmarkPrice ? formatPrice(v.benchmarkPrice) : "—";
    process.stdout.write(`  ${label}  —  your ${price} vs benchmark ${bench}\n`);
  }
}

// Metrics `gmc reports check` can gate on, aggregated client-side from product_performance_view.
const CHECK_METRICS = new Set(["clicks", "impressions", "conversions", "ctr"]);

interface PerformanceTotals {
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
}

// A non-negative, finite count from an int64-as-string / number / missing value.
function toCount(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function aggregatePerformance(rows: ReportRow[]): PerformanceTotals {
  let clicks = 0;
  let impressions = 0;
  let conversions = 0;
  for (const r of rows) {
    const v = r.productPerformanceView;
    if (!v) continue;
    clicks += toCount(v.clicks);
    impressions += toCount(v.impressions);
    conversions += toCount(v.conversions);
  }
  return { clicks, impressions, conversions, ctr: impressions ? clicks / impressions : 0 };
}

/** Parse a `--min`/`--max` threshold as a non-negative finite number, or throw. */
function parseThreshold(flag: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new UsageError(
      `Invalid ${flag} "${raw}".`,
      "Use a non-negative number (a fraction like 0.02 for --metric ctr).",
    );
  }
  return n;
}

function formatMetric(metric: string, value: number): string {
  return metric === "ctr" ? `${(value * 100).toFixed(2)}%` : String(value);
}

/** Register the `gmc reports` command group (query / performance / competitive-visibility / price-competitiveness / check). */
export function registerReportsCommands(program: Command): void {
  const reports = program
    .command("reports")
    .description("Query Merchant Center reports (Merchant Center Query Language)");

  reports
    .command("query")
    .argument("<mcql>", "A Merchant Center Query Language query")
    .option("--page-size <n>", "Max rows per API page")
    .description("Run an arbitrary MCQL query and print the result rows")
    .action(async (mcql: string, opts: { pageSize?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const service = new ReportsService(await clientFor(ctx, account));
        const rows = await service.search(mcql, pageSize ? { pageSize } : {});
        if (ctx.json) {
          emitJson({ results: rows });
        } else {
          for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
          process.stdout.write(`${rows.length} row(s).\n`);
        }
      } catch (err) {
        reportError(err, { json }, "gmc reports query");
      }
    });

  reports
    .command("performance")
    .description("Product performance (clicks / impressions / CTR) over a date window")
    .option("--days <n>", "Window size in days, ending today (default 30)")
    .option("--since <date>", "Start date (ISO, e.g. 2026-05-01); overrides --days")
    .option("--until <date>", "End date (ISO; default today)")
    .option("--page-size <n>", "Max rows per API page")
    .action(async (opts: PerfOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const { since, until } = resolveWindow(opts);
        const service = new ReportsService(await clientFor(ctx, account));
        const rows = await service.search(
          performanceQuery(since, until),
          pageSize ? { pageSize } : {},
        );
        if (ctx.json) emitJson({ results: rows, since, until });
        else renderPerformance(rows, since, until);
      } catch (err) {
        reportError(err, { json }, "gmc reports performance");
      }
    });

  reports
    .command("competitive-visibility")
    .description("How your domain's visibility compares to competitors in a category")
    .option("--country <code>", "2-letter report country code, e.g. US (required)")
    .option("--category <id>", "Numeric Google product category id, e.g. 536 (required)")
    .option("--traffic-source <src>", "ADS, ORGANIC, or ALL (default ADS)")
    .option("--days <n>", "Window size in days, ending today (default 30)")
    .option("--since <date>", "Start date (ISO); overrides --days")
    .option("--until <date>", "End date (ISO; default today)")
    .option("--page-size <n>", "Max rows per API page")
    .action(
      async (opts: PerfOpts & { country?: string; category?: string; trafficSource?: string }) => {
        const json = wantsJson(program);
        try {
          const ctx = contextFrom(program);
          const account = resolveAccount(undefined, ctx);
          const pageSize = parsePageSize(opts.pageSize);
          const country = requireCountry(opts.country);
          const category = requireCategory(opts.category);
          const trafficSource = normTrafficSource(opts.trafficSource);
          const { since, until } = resolveWindow(opts);
          const service = new ReportsService(await clientFor(ctx, account));
          const query = competitiveVisibilityQuery(country, category, trafficSource, since, until);
          const rows = await service.search(query, pageSize ? { pageSize } : {});
          if (ctx.json) emitJson({ results: rows, country, category, trafficSource, since, until });
          else renderCompetitiveVisibility(rows);
        } catch (err) {
          reportError(err, { json }, "gmc reports competitive-visibility");
        }
      },
    );

  reports
    .command("price-competitiveness")
    .description("Your prices vs the category benchmark, per product")
    .option("--country <code>", "Filter to a 2-letter report country code, e.g. US")
    .option("--page-size <n>", "Max rows per API page")
    .action(async (opts: { country?: string; pageSize?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const country = opts.country ? requireCountry(opts.country) : undefined;
        const service = new ReportsService(await clientFor(ctx, account));
        const rows = await service.search(
          priceCompetitivenessQuery(country),
          pageSize ? { pageSize } : {},
        );
        if (ctx.json) emitJson({ results: rows, ...(country ? { country } : {}) });
        else renderPriceCompetitiveness(rows);
      } catch (err) {
        reportError(err, { json }, "gmc reports price-competitiveness");
      }
    });

  reports
    .command("check")
    .description("Gate CI on a performance metric threshold (non-zero exit if breached)")
    .option("--metric <name>", "clicks, impressions, conversions, or ctr (a 0–1 fraction)")
    .option("--min <n>", "Fail if the metric is below this (ctr as a fraction, e.g. 0.02)")
    .option("--max <n>", "Fail if the metric is above this")
    .option("--days <n>", "Window size in days, ending today (default 30)")
    .option("--since <date>", "Start date (ISO); overrides --days")
    .option("--until <date>", "End date (ISO; default today)")
    .option("--page-size <n>", "Max rows per API page")
    .action(async (opts: PerfOpts & { metric?: string; min?: string; max?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const metric = opts.metric;
        if (!metric || !CHECK_METRICS.has(metric)) {
          throw new UsageError(
            `Invalid or missing --metric "${metric ?? ""}".`,
            "Use one of: clicks, impressions, conversions, ctr.",
          );
        }
        const min = parseThreshold("--min", opts.min);
        const max = parseThreshold("--max", opts.max);
        if (min === undefined && max === undefined) {
          throw new UsageError("Pass --min and/or --max.", "e.g. --metric clicks --min 100.");
        }
        const { since, until } = resolveWindow(opts);
        const service = new ReportsService(await clientFor(ctx, account));
        const totals = aggregatePerformance(
          await service.search(performanceQuery(since, until), pageSize ? { pageSize } : {}),
        );
        const value = totals[metric as keyof PerformanceTotals];
        const belowMin = min !== undefined && value < min;
        const aboveMax = max !== undefined && value > max;
        const ok = !belowMin && !aboveMax;

        if (ctx.json) {
          emitJson({
            metric,
            value,
            ...(min !== undefined ? { min } : {}),
            ...(max !== undefined ? { max } : {}),
            ok,
            since,
            until,
          });
        } else {
          process.stdout.write(
            `${metric} = ${formatMetric(metric, value)} (${since} → ${until})\n`,
          );
          if (ok) {
            process.stdout.write("Passed.\n");
          } else if (belowMin) {
            process.stdout.write(`Failed — below --min ${formatMetric(metric, min as number)}.\n`);
          } else {
            process.stdout.write(`Failed — above --max ${formatMetric(metric, max as number)}.\n`);
          }
        }
        if (!ok) process.exitCode = ExitCode.Error;
      } catch (err) {
        reportError(err, { json }, "gmc reports check");
      }
    });
}
