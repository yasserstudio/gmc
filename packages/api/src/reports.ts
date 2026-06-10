// Typed Reports sub-API service (Merchant API `reports/v1`). Reporting is a single
// method — `reports.search` — that runs a Merchant Center Query Language (MCQL)
// query against a report view (e.g. `product_performance_view`) and returns rows.
// Unlike the CRUD services, search POSTs the query in the body and paginates with
// a `pageToken` in the body (not a query param), so it can't reuse `client.paginate`.
// Runs on the "reports" rate-limit bucket.

import type { MerchantClient } from "./client.js";
import type { Price } from "./products.js";

const REPORTS_API = "reports/v1";

// As elsewhere, these model only the fields the CLI reads; the row shape varies by
// the MCQL query, and `client.post` round-trips the full JSON, so `--json` is lossless.

/** A calendar date as the reports API returns it (google.type.Date). */
export interface ReportDate {
  year?: number;
  month?: number;
  day?: number;
}

/** A row of `product_performance_view` (clicks/impressions/etc.). Subset. */
export interface ProductPerformanceView {
  marketingMethod?: string;
  date?: ReportDate;
  clicks?: string;
  impressions?: string;
  clickThroughRate?: number;
  conversions?: number;
  conversionValue?: Price;
  [key: string]: unknown;
}

/** A row of `competitive_visibility_competitor_view`. Subset. */
export interface CompetitiveVisibilityCompetitorView {
  reportCountryCode?: string;
  reportCategoryId?: string;
  trafficSource?: string;
  domain?: string;
  isYourDomain?: boolean;
  rank?: string;
  adsOrganicRatio?: number;
  pageOverlapRate?: number;
  higherPositionRate?: number;
  relativeVisibility?: number;
  [key: string]: unknown;
}

/** A row of `price_competitiveness_product_view`. `price`/`benchmarkPrice` are Prices. Subset. */
export interface PriceCompetitivenessProductView {
  id?: string;
  title?: string;
  brand?: string;
  price?: Price;
  benchmarkPrice?: Price;
  reportCountryCode?: string;
  [key: string]: unknown;
}

/**
 * One result row. The populated field depends on which view the query targets;
 * the typed views below cover the `gmc reports` presets, and any other view
 * arrives under its own key via the index signature (so `--json` is never lossy).
 */
export interface ReportRow {
  productPerformanceView?: ProductPerformanceView;
  competitiveVisibilityCompetitorView?: CompetitiveVisibilityCompetitorView;
  priceCompetitivenessProductView?: PriceCompetitivenessProductView;
  [view: string]: unknown;
}

/** One page of `reports.search`. */
interface ReportsSearchPage {
  results?: ReportRow[];
  nextPageToken?: string;
}

/** Read access to the Merchant API Reports sub-API (`reports.search`). */
export class ReportsService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${REPORTS_API}/${this.client.accountResource}`;
  }

  /**
   * Run an MCQL query and return every result row, following pagination. The
   * query, pageSize, and pageToken all go in the POST body (the reports API does
   * not use query params for paging).
   */
  async search(query: string, opts: { pageSize?: number } = {}): Promise<ReportRow[]> {
    const rows: ReportRow[] = [];
    let pageToken: string | undefined;
    do {
      const body: { query: string; pageSize?: number; pageToken?: string } = { query };
      if (opts.pageSize) body.pageSize = opts.pageSize;
      if (pageToken) body.pageToken = pageToken;

      const page = await this.client.post<ReportsSearchPage>(
        "reports",
        `${this.base}/reports:search`,
        body,
      );
      for (const row of page.results ?? []) rows.push(row);

      const next = page.nextPageToken;
      // Guard against a server that echoes the same token forever.
      if (next && next === pageToken) {
        throw new Error("Merchant API pagination did not advance (repeated pageToken).");
      }
      pageToken = next;
    } while (pageToken);
    return rows;
  }
}
