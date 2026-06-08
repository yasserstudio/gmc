// @gmc-cli/auth — Google Merchant API authentication.
// v0.1: service-account auth, with env-var and Application Default Credentials
// resolution and a mutex-guarded, disk-backed token cache.
// v0.2: interactive OAuth user login (bring-your-own client) and a per-sub-API
// scope resolver. Forked from @gpc-cli/auth.

export { resolveAuth } from "./resolve.js";
export { loadServiceAccountKey, createServiceAccountAuth } from "./service-account.js";
export type { ServiceAccountAuthOptions } from "./service-account.js";
export { acquireToken, clearTokenCache } from "./token-cache.js";
export { MERCHANT_API_SCOPE, DEFAULT_SCOPES, scopesFor } from "./scopes.js";
export type { SubApi } from "./scopes.js";
export {
  loginWithOAuth,
  createOAuthAuth,
  loadOAuthClientConfig,
  parseClientSecretsJson,
} from "./oauth.js";
export type { LoginOptions, OAuthAuthOptions, OAuthClientConfig } from "./oauth.js";
export {
  loadStoredCredential,
  saveStoredCredential,
  clearStoredCredential,
  DEFAULT_PROFILE,
} from "./oauth-store.js";
export type { StoredOAuthCredential } from "./oauth-store.js";
export { AuthError } from "./errors.js";
export type { AuthOptions, AuthClient, ServiceAccountKey } from "./types.js";
