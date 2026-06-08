// @gmc-cli/api — typed Google Merchant API client.
// Phase 1 added a minimal Merchant API probe for `gmc doctor`.
// Phase 2 (v0.5): typed MerchantClient with a per-sub-API (6-bucket) rate
// limiter, retry/backoff, and pagination. v0.6 wires Accounts, v0.7 Products.

export type { SubApi } from "./types.js";
export { SUB_APIS } from "./types.js";

export { MerchantClient } from "./client.js";
export type { MerchantClientOptions, RequestOptions } from "./client.js";

export { MerchantApiError } from "./errors.js";

export {
  RateLimiter,
  systemClock,
  DEFAULT_RATE_LIMITS,
} from "./rate-limiter.js";
export type { RateLimitConfig, BucketConfig, Clock } from "./rate-limiter.js";

export { probeMerchantApi } from "./probe.js";
export type { ProbeOptions, ProbeResult } from "./probe.js";

export type { GoogleErrorBody, GoogleErrorDetail } from "./google-error.js";
