// Typed Issue Resolution service (Merchant API `issueresolution/v1`). Read-only:
// renders Google's account-level and product-level issues — title, severity,
// impact, region breakdowns, and the prerendered HTML resolution content — so you
// can see why an account or product is limited and how to fix it. The render
// methods are POST (the sub-API has no GET/list); the writable `triggeraction` is
// allowlist-gated and intentionally not exposed. Runs on the "issueresolution"
// rate-limit bucket. Wraps a MerchantClient scoped to one account.

import type { MerchantClient } from "./client.js";
import { productSegment } from "./products.js";

const ISSUES_API = "issueresolution/v1";

// As elsewhere, these model the response fields the CLI reads or surfaces under
// `--json`; the Merchant API returns more, and `client.request` round-trips the
// full JSON, so `--json` output (including the prerendered HTML) is never lossy.

/** A geographic region an issue's impact applies to. */
export interface IssueRegion {
  code?: string;
  name?: string;
}

/** One region/destination breakdown of an issue's impact. */
export interface IssueBreakdown {
  regions?: IssueRegion[];
  details?: string[];
}

/** How an issue affects the account or product. */
export interface IssueImpact {
  message?: string;
  /** Severity enum: `NOT_IMPACTED` | `DEMOTED` | `DISAPPROVED` | `SEVERITY_UNSPECIFIED`. */
  severity?: string;
  breakdowns?: IssueBreakdown[];
}

/** A single rendered issue with its resolution content. */
export interface RenderedIssue {
  title?: string;
  impact?: IssueImpact;
  /** HTML detail of the issue, ready to embed in a UI. */
  prerenderedContent?: string;
  prerenderedOutOfCourtDisputeSettlement?: string;
  actions?: unknown[];
}

interface RenderIssuesResponse {
  renderedIssues?: RenderedIssue[];
}

/**
 * Localization for a render call. Both default server-side when omitted
 * (`languageCode` → `en-US`, `timeZone` → UTC).
 */
export interface RenderOptions {
  languageCode?: string;
  timeZone?: string;
}

function queryOf(opts: RenderOptions): Record<string, string | undefined> {
  return { languageCode: opts.languageCode, timeZone: opts.timeZone };
}

/** Read-only access to the Merchant API Issue Resolution sub-API. */
export class IssuesService {
  constructor(private readonly client: MerchantClient) {}

  /** Render account-level issues with their resolution content. */
  async renderAccountIssues(opts: RenderOptions = {}): Promise<RenderedIssue[]> {
    const res = await this.client.request<RenderIssuesResponse>(
      "issueresolution",
      "POST",
      `${ISSUES_API}/${this.client.accountResource}:renderaccountissues`,
      { query: queryOf(opts), body: {} },
    );
    return res.renderedIssues ?? [];
  }

  /**
   * Render item-level issues for a single product. Accepts a bare product id or
   * the full `name` returned by `products list` (reduced via {@link productSegment}).
   */
  async renderProductIssues(productId: string, opts: RenderOptions = {}): Promise<RenderedIssue[]> {
    const segment = productSegment(productId);
    if (!segment.trim()) {
      throw new Error(
        "Empty product id. Pass a product id or the resource name from `products list`.",
      );
    }
    const res = await this.client.request<RenderIssuesResponse>(
      "issueresolution",
      "POST",
      `${ISSUES_API}/${this.client.accountResource}/products/${encodeURIComponent(segment)}:renderproductissues`,
      { query: queryOf(opts), body: {} },
    );
    return res.renderedIssues ?? [];
  }
}
