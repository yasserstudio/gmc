// Helpers shared by the Merchant API command groups (accounts, products, ...):
// resolving the target account and building a client from the invocation context.

import { createMerchantClient, UsageError, type CommandContext } from "@gmc-cli/core";
import type { MerchantClient } from "@gmc-cli/api";
import { getConfigDir } from "@gmc-cli/config";

/**
 * Resolve the target account from a positional arg or the context, validating it.
 * `positional` is undefined for commands that take the account only from
 * --account / GMC_ACCOUNT_ID / profile (e.g. products); accounts get/info also
 * accept it as an argument.
 */
export function resolveAccount(positional: string | undefined, ctx: CommandContext): string {
  const account = positional ?? ctx.accountId;
  if (!account) {
    throw new UsageError(
      "No Merchant Center account id given.",
      "Set --account / GMC_ACCOUNT_ID / a profile (accounts commands also accept it as an argument).",
    );
  }
  // Merchant Center account ids are numeric (same rule @gmc-cli/config enforces).
  if (!/^\d+$/.test(account)) {
    throw new UsageError(`Invalid account id "${account}".`, "Account ids are numeric, e.g. 123456789.");
  }
  return account;
}

/**
 * Build a MerchantClient from the context. Pass `accountId` to scope the client
 * to one account (so the service can use `client.accountResource`); omit it for
 * account-agnostic calls like `accounts list`.
 */
export function clientFor(ctx: CommandContext, accountId?: string): Promise<MerchantClient> {
  return createMerchantClient({
    configDir: getConfigDir(),
    profile: ctx.profile,
    ...(accountId ? { accountId } : {}),
  });
}
