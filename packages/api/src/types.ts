// Shared types for @gmc-cli/api. Kept out of the barrel so client.ts and
// rate-limiter.ts can import SubApi without a circular dependency through index.

/** The Merchant API sub-APIs the client covers — one rate-limit bucket each. */
export type SubApi =
  | "products"
  | "inventories"
  | "reports"
  | "accounts"
  | "datasources"
  | "promotions"
  | "notifications"
  | "quota"
  | "issueresolution"
  | "conversions"
  | "lfp"
  | "ordertracking";

/** All sub-API keys, in a stable order. */
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
  "conversions",
  "lfp",
  "ordertracking",
];
