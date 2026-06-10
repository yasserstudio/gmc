// @gmc-cli/migrate — the engine behind `gmc migrate`, the Content API for
// Shopping → Merchant API assistant. Pure: no network, no auth, no filesystem.
// The CLI resolves credentials, probes the Merchant API, and reads/writes config;
// this package maps the legacy setup to Merchant API equivalents.
//
// Phase 5 lands in three parts:
//   v0.9.6 — scopes: scope-model audit + legacy-config → profile migration (here).
//   v0.9.7 — products: Content API v2.1 product JSON → Merchant API ProductInput.
//   v0.9.8 — feed-labels: feed-label transfer check.

export { auditScopes } from "./scopes.js";
export type { ScopeAuditInput } from "./scopes.js";
export { parseMerchantInfo } from "./legacy.js";
export type { LegacyMerchantInfo } from "./legacy.js";
export { planProfileMigration } from "./profile-plan.js";
export type { ConfigView, ProfilePlanInput, ProfilePlan, ProfileAction } from "./profile-plan.js";
export { transformProduct, parseContentApiId, isTransformError } from "./products.js";
// toMicros now lives with the Price type in @gmc-cli/api; re-exported so existing
// `@gmc-cli/migrate` consumers keep importing it from one place.
export { toMicros } from "@gmc-cli/api";
export type {
  ProductTransform,
  ProductTransformError,
  ProductTransformResult,
} from "./products.js";
export { checkFeedLabels } from "./feed-labels.js";
export type {
  FeedLabelProduct,
  FeedLabelSource,
  FeedLabelSeverity,
  FeedLabelGroup,
  FeedLabelFinding,
  FeedLabelCounts,
  FeedLabelReport,
  CheckFeedLabelsOptions,
} from "./feed-labels.js";
export { MigrateError } from "./errors.js";
export type { CheckStatus, SubApiScopeMapping, MigrationCheck, ScopeAuditReport } from "./types.js";
