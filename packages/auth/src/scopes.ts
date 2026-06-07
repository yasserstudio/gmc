// OAuth scopes for the Google Merchant API.
//
// The new Merchant API uses the same OAuth scope as the legacy Content API for
// Shopping: `https://www.googleapis.com/auth/content`. Centralized here so the
// "scope swap" migration step (and any future per-sub-API scopes) lives in one place.

/** Default OAuth scope for the Google Merchant API. */
export const MERCHANT_API_SCOPE = "https://www.googleapis.com/auth/content";

/** Scopes requested when none are supplied explicitly. */
export const DEFAULT_SCOPES: readonly string[] = [MERCHANT_API_SCOPE];
