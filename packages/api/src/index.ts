// @gmc-cli/api — typed Google Merchant API client.
// Phase 1 added a minimal Merchant API probe for `gmc doctor`.
// Phase 2 (v0.5): typed MerchantClient with a per-sub-API (6-bucket) rate
// limiter, retry/backoff, and pagination. v0.6 wires Accounts, v0.7 Products.

export type { SubApi } from "./types.js";
export { SUB_APIS } from "./types.js";

export { MerchantClient } from "./client.js";
export type { MerchantClientOptions, RequestOptions } from "./client.js";

export { AccountsService, accountResourceName } from "./accounts.js";
export type {
  Account,
  BusinessInfo,
  Homepage,
  AccountInfo,
  PostalAddress,
  Phone,
  CustomerService,
  TimeZone,
} from "./accounts.js";

export { ProductsService, productSegment, toProductInput, productKey } from "./products.js";
export type {
  Product,
  ProductInput,
  ProductAttributes,
  CustomAttribute,
  Price,
  ProductStatus,
  ItemLevelIssue,
} from "./products.js";

export { DataSourcesService, dataSourceSegment } from "./datasources.js";
export type {
  DataSource,
  PrimaryProductDataSource,
  FileInput,
  FetchSettings,
} from "./datasources.js";

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
