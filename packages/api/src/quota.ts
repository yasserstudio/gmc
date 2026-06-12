// Typed Quota service (Merchant API `quota/v1`, `accounts.quotas`). Read-only: lists
// the daily Merchant API call quota and usage per method group for an account, so you
// can see your rate-limit headroom. The only method is `list`. Runs on the "quota"
// rate-limit bucket. Wraps a MerchantClient scoped to one account.

import type { MerchantClient } from "./client.js";

const QUOTA_API = "quota/v1";

// As elsewhere, these model only the fields the CLI reads; the Merchant API returns
// more, and `client.get` round-trips the full JSON, so `--json` output is never lossy.
// The int64 quota counts arrive as JSON strings (like `Price.amountMicros`).

/** One method covered by a quota group. */
export interface MethodDetail {
  /** e.g. `products.list`. */
  method?: string;
  version?: string;
  subapi?: string;
  /** Full path, e.g. `products/v1/productInputs.insert`. */
  path?: string;
}

/**
 * Daily call quota + usage for a group of methods
 * (`accounts/{account}/quotas/{group}`). The counts are int64 JSON strings. The daily
 * limits reset at 12:00 UTC.
 */
export interface QuotaGroup {
  /** Output-only resource name: `accounts/{account}/quotas/{group}`. */
  name?: string;
  /** Daily calls used so far. */
  quotaUsage?: string;
  /** Maximum daily calls for the group. */
  quotaLimit?: string;
  /** Per-minute rate limit for the group. */
  quotaMinuteLimit?: string;
  methodDetails?: MethodDetail[];
}

/** One page of `quotas.list`. */
interface QuotasListPage {
  quotaGroups?: QuotaGroup[];
  nextPageToken?: string;
}

/** Read-only access to the Merchant API Quota sub-API. */
export class QuotaService {
  constructor(private readonly client: MerchantClient) {}

  /** List every quota group for the account, following pagination. */
  async listQuotas(): Promise<QuotaGroup[]> {
    const groups: QuotaGroup[] = [];
    for await (const g of this.client.paginate<QuotaGroup>(
      "quota",
      `${QUOTA_API}/${this.client.accountResource}/quotas`,
      { select: (page) => (page as QuotasListPage).quotaGroups ?? [] },
    )) {
      groups.push(g);
    }
    return groups;
  }
}
