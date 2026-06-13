// OAuth scopes for the Google Merchant API.
//
// The new Merchant API uses the same OAuth scope as the legacy Content API for
// Shopping: `https://www.googleapis.com/auth/content`. Today every sub-API maps
// to that single scope, but the access surface is modeled per sub-API so the
// Phase 5 "scope swap" migration step — and any future granular scopes Google
// introduces — live in exactly one place.

/** Default OAuth scope for the Google Merchant API. */
export const MERCHANT_API_SCOPE = "https://www.googleapis.com/auth/content";

/** Scopes requested when none are supplied explicitly. */
export const DEFAULT_SCOPES: readonly string[] = [MERCHANT_API_SCOPE];

/** Sub-APIs of the Merchant API that the client targets. Mirrors `@gmc-cli/api`. */
export type SubApi =
  | "products"
  | "inventories"
  | "reports"
  | "accounts"
  | "datasources"
  | "promotions"
  | "notifications"
  | "quota"
  | "issueresolution";

/** All sub-API keys, in a stable order. Mirrors `@gmc-cli/api` SUB_APIS. */
export const SUB_APIS: readonly SubApi[] = [
  "products",
  "inventories",
  "reports",
  "accounts",
  "datasources",
  "promotions",
  "notifications",
  "quota",
  "issueresolution",
];

// Per-sub-API scope map. Every entry currently resolves to the content scope;
// when Google ships granular scopes, only this table changes.
const SUB_API_SCOPES: Readonly<Record<SubApi, readonly string[]>> = {
  products: [MERCHANT_API_SCOPE],
  inventories: [MERCHANT_API_SCOPE],
  reports: [MERCHANT_API_SCOPE],
  accounts: [MERCHANT_API_SCOPE],
  datasources: [MERCHANT_API_SCOPE],
  promotions: [MERCHANT_API_SCOPE],
  notifications: [MERCHANT_API_SCOPE],
  quota: [MERCHANT_API_SCOPE],
  issueresolution: [MERCHANT_API_SCOPE],
};

/**
 * Resolve the deduplicated set of OAuth scopes needed for one or more sub-APIs.
 * With no argument, returns the default Merchant API scope. The result is a
 * fresh array safe for the caller to mutate.
 */
export function scopesFor(subApis?: SubApi | readonly SubApi[]): string[] {
  if (subApis === undefined) {
    return [...DEFAULT_SCOPES];
  }
  const list: readonly SubApi[] = typeof subApis === "string" ? [subApis] : subApis;
  const scopes = new Set<string>();
  for (const sub of list) {
    // Fall back to the content scope for an unrecognized sub-API (e.g. a value
    // from a future `@gmc-cli/api` SubApi this map hasn't caught up to) rather
    // than throwing on an undefined lookup.
    for (const scope of SUB_API_SCOPES[sub] ?? DEFAULT_SCOPES) {
      scopes.add(scope);
    }
  }
  // An empty selection still needs a usable default rather than no scopes.
  if (scopes.size === 0) {
    return [...DEFAULT_SCOPES];
  }
  return [...scopes];
}
