// @gmc-cli/auth — Google Merchant API authentication.
// v0.1: service-account auth, with env-var and Application Default Credentials
// resolution and a mutex-guarded, disk-backed token cache. Forked from @gpc-cli/auth.

export { resolveAuth } from "./resolve.js";
export { loadServiceAccountKey, createServiceAccountAuth } from "./service-account.js";
export type { ServiceAccountAuthOptions } from "./service-account.js";
export { acquireToken, clearTokenCache } from "./token-cache.js";
export { MERCHANT_API_SCOPE, DEFAULT_SCOPES } from "./scopes.js";
export { AuthError } from "./errors.js";
export type { AuthOptions, AuthClient, ServiceAccountKey } from "./types.js";
