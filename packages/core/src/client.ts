// Shared auth+client wiring: resolve a credential and build a typed MerchantClient
// for it. Every command that talks to the Merchant API (accounts, products, ...)
// goes through here, so credential resolution and client construction stay in one
// place. Mirrors the resolveAuth call `runDoctor` makes.

import { resolveAuth } from "@gmc-cli/auth";
import { MerchantClient } from "@gmc-cli/api";

export interface CreateMerchantClientOptions {
  /** Config/credential directory (token cache + stored OAuth login). */
  configDir: string;
  /** Resolved profile name. */
  profile: string;
  /** Target Merchant Center account id, if any. */
  accountId?: string;
  /** Merchant API base URL override (for testing). */
  baseUrl?: string;
}

/**
 * Resolve a credential and build a {@link MerchantClient} for it. Resolving the
 * credential may throw AuthError (exit code 3); no network call happens until the
 * client issues a request.
 */
export async function createMerchantClient(
  options: CreateMerchantClientOptions,
): Promise<MerchantClient> {
  const auth = await resolveAuth({ cachePath: options.configDir, profile: options.profile });
  return new MerchantClient({
    auth,
    ...(options.accountId ? { accountId: options.accountId } : {}),
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });
}
