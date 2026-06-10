// Parse a legacy Content API for Shopping config. The recognized shape is the
// `merchant-info.json` from Google's official googleads-shopping-samples, which is
// what most Content API integrations were bootstrapped from. We only need the
// merchant id to seed a gmc profile; everything else is informational.

import { MigrateError } from "./errors.js";

/** The fields read from a Content API `merchant-info.json`. */
export interface LegacyMerchantInfo {
  /** Merchant Center account id (numeric string). */
  merchantId: string;
  /** The service-account / sample-user email, when present — informational. */
  accountSampleUser?: string;
}

/**
 * Extract and validate the merchant id from a parsed legacy config object.
 * Throws {@link MigrateError} (exit 2) when the shape is unrecognized or the
 * merchant id is missing/non-numeric. The Content API samples store `merchantId`
 * as either a number or a numeric string, so both are accepted.
 */
export function parseMerchantInfo(raw: unknown): LegacyMerchantInfo {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MigrateError(
      "The legacy config is not a JSON object.",
      "MIGRATE_LEGACY_INVALID",
      "Pass a Content API merchant-info.json (a single JSON object) via --from.",
    );
  }
  const obj = raw as Record<string, unknown>;
  const rawId = obj["merchantId"];
  // A numeric merchantId past 2^53 was already mangled by JSON.parse (IEEE-754),
  // so reject it rather than write a silently-truncated account id to config.
  if (typeof rawId === "number" && !Number.isSafeInteger(rawId)) {
    throw new MigrateError(
      'The legacy config\'s numeric "merchantId" is out of safe-integer range.',
      "MIGRATE_LEGACY_NO_MERCHANT_ID",
      "Quote the merchantId as a string in merchant-info.json, or use --account <id>.",
    );
  }
  const merchantId = typeof rawId === "number" ? String(rawId) : rawId;
  if (typeof merchantId !== "string" || !/^\d+$/.test(merchantId)) {
    throw new MigrateError(
      'The legacy config has no valid "merchantId".',
      "MIGRATE_LEGACY_NO_MERCHANT_ID",
      "Provide a merchant-info.json with a numeric merchantId, or use --account <id>.",
    );
  }
  const info: LegacyMerchantInfo = { merchantId };
  const sampleUser = obj["accountSampleUser"];
  if (typeof sampleUser === "string" && sampleUser) info.accountSampleUser = sampleUser;
  return info;
}
