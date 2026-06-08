// @gmc-cli/api — typed Google Merchant API client.
// Phase 0 scaffold. Phase 1 adds a minimal Merchant API probe for `gmc doctor`.
// Phase 2 forks the GPC API-client pattern (6-bucket rate limiter, pagination)
// and wires the Products and Accounts sub-APIs.

import type { AuthClient } from "@gmc-cli/auth";

export { probeMerchantApi } from "./probe.js";
export type { ProbeOptions, ProbeResult } from "./probe.js";

/** The Merchant API sub-APIs this client will cover. */
export type SubApi =
  | "products"
  | "inventories"
  | "reports"
  | "accounts"
  | "promotions"
  | "quota";

export interface MerchantClientOptions {
  /** Authenticated client supplying bearer tokens. */
  auth: AuthClient;
  /** Merchant Center account id (numeric). */
  accountId: string;
  /** API base URL override (defaults to the Merchant API endpoint in Phase 2). */
  baseUrl?: string;
}

/**
 * Typed entry point for the Google Merchant API.
 * Phase 0 scaffold — sub-API methods land in Phase 2.
 */
export class MerchantClient {
  constructor(private readonly options: MerchantClientOptions) {}

  /** The Merchant Center account this client targets. */
  get accountId(): string {
    return this.options.accountId;
  }

  /** The configured auth client. */
  get auth(): AuthClient {
    return this.options.auth;
  }
}
