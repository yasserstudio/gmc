// @gmc-cli/auth — Google Merchant API authentication.
// Phase 0 scaffold. Phase 1 forks the real implementation from @gpc-cli/auth
// (service account, OAuth 2.0, ADC) and adapts the per-sub-API Merchant scopes.

export type AuthMethod = "service-account" | "oauth" | "adc";

export interface AuthOptions {
  /** How to authenticate. Defaults to ADC discovery in Phase 1. */
  method?: AuthMethod;
  /** Path to a service-account JSON key file. */
  keyFile?: string;
  /** OAuth / API scopes to request. */
  scopes?: string[];
}

export interface AuthClient {
  /** Returns a valid bearer token, refreshing as needed. */
  getAccessToken(): Promise<string>;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Resolve an {@link AuthClient} from the given options.
 * Not implemented in the Phase 0 scaffold — see Phase 1 (fork of @gpc-cli/auth).
 */
export async function resolveAuth(_options: AuthOptions = {}): Promise<AuthClient> {
  throw new AuthError("auth is not implemented yet — Phase 1 (fork of @gpc-cli/auth)");
}
