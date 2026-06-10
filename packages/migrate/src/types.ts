// Shared types for @gmc-cli/migrate — the Content API → Merchant API engine.
// Kept out of the barrel so scopes.ts, legacy.ts, and profile-plan.ts can import
// them without a cycle through index.

import type { SubApi } from "@gmc-cli/auth";

/**
 * A diagnosis status. Mirrors `gmc doctor`'s pass/warn/fail rather than
 * preflight's severities: the scope audit reports auth/registration *health*,
 * not feed-content problems.
 */
export type CheckStatus = "pass" | "warn" | "fail";

/** The OAuth scope(s) the Merchant API needs for one sub-API. */
export interface SubApiScopeMapping {
  subApi: SubApi;
  scopes: string[];
}

/**
 * One item in the auth/registration readiness checklist — the *real* migration
 * blockers (credential, live Merchant API access), distinct from the scope
 * string, which is unchanged today.
 */
export interface MigrationCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  suggestion?: string;
}

/** Result of the offline (scope-model) + best-effort (live probe) auth audit. */
export interface ScopeAuditReport {
  /** The OAuth scope both APIs use today (`.../auth/content`). */
  legacyScope: string;
  /**
   * True when every sub-API still maps to the single legacy scope — i.e. existing
   * Content API tokens already authorize the Merchant API and no re-consent is
   * needed. Flips automatically if Google ships granular scopes (see
   * `@gmc-cli/auth` scopes.ts).
   */
  scopeUnchanged: boolean;
  /** Per-sub-API scope mapping. */
  mapping: SubApiScopeMapping[];
  /** Auth/registration readiness checks. */
  checks: MigrationCheck[];
  /** True when no check failed (warnings allowed). */
  ok: boolean;
}
