// The product-transform half of `gmc migrate` (v0.9.7). Pure: it maps a Content
// API for Shopping v2.1 product object to a Merchant API `ProductInput` — the same
// push-ready shape `gmc feeds pull` emits — so the output drops straight into
// `gmc feeds push` / `gmc preflight`. The CLI does all I/O (reading the source,
// writing the output dir, rendering the report); this engine only transforms.
//
// The Merchant API keeps only identity fields at the top level and nests everything
// descriptive under `attributes`, and the two APIs share product-spec attribute
// names — so the transform is data-driven: move every field except the identity
// ones into `attributes`, convert price-shaped values to micros, and remap the
// identity / `id` / `targetCountry` fields. The one real rename is
// `targetCountry` → `feedLabel`.

import type { CustomAttribute, Price, ProductInput } from "@gmc-cli/api";

// Identity / structural fields handled explicitly — never hoisted into attributes.
const IDENTITY_FIELDS = new Set([
  "offerId",
  "channel",
  "contentLanguage",
  "targetCountry",
  "feedLabel",
  "customAttributes",
]);

// Output-only / transport fields with no Merchant API home — dropped and reported.
const DROP_FIELDS = new Set(["id", "kind", "source", "selfLink"]);

// Merchant API availability enum (underscored). Content API used spaces.
const AVAILABILITY_ENUM = new Set(["in_stock", "out_of_stock", "preorder", "backorder"]);

/** A successful product transform, with report metadata for the CLI. */
export interface ProductTransform {
  input: ProductInput;
  /** Identity remaps applied (e.g. `targetCountry "US" → feedLabel`). */
  remapped: string[];
  /** Output-only fields removed (e.g. `id`, `kind`). */
  dropped: string[];
  /** Non-fatal issues (e.g. a price whose value couldn't be parsed). */
  warnings: string[];
}

/** A product that couldn't be transformed at all. */
export interface ProductTransformError {
  error: string;
}

export type ProductTransformResult = ProductTransform | ProductTransformError;

/** Narrow a transform result to the error case. */
export function isTransformError(r: ProductTransformResult): r is ProductTransformError {
  return "error" in r;
}

/** A non-empty string, else undefined. */
function strOr(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/**
 * Convert a Content API decimal price string to integer micros (value × 1,000,000),
 * or null if the value isn't a non-negative decimal. BigInt-based so large catalogs
 * and long fractions never hit floating-point error; rounds half-up at the 6th
 * fractional digit (micros precision).
 */
export function toMicros(value: string | number): string | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!m) return null;
  if (m[1] === "-") return null; // prices are non-negative
  const intPart = m[2] ?? "0"; // group 2 (\d+) always matches when m is non-null
  let frac = m[3] ?? "";
  let carry = 0n;
  if (frac.length > 6) {
    if (frac.charCodeAt(6) - 48 >= 5) carry = 1n; // round half-up on the 7th digit
    frac = frac.slice(0, 6);
  } else {
    frac = frac.padEnd(6, "0");
  }
  return (BigInt(intPart) * 1_000_000n + BigInt(frac) + carry).toString();
}

/** True when an object is a Content API money value (`{value, currency}`). */
function isPriceShape(obj: Record<string, unknown>): obj is { value: string | number; currency: string } {
  return (
    "value" in obj &&
    "currency" in obj &&
    typeof obj["currency"] === "string" &&
    (typeof obj["value"] === "string" || typeof obj["value"] === "number")
  );
}

/**
 * Recursively convert every Content API money value (`{value, currency}`) in a
 * value tree to a Merchant API `Price` (`{amountMicros, currencyCode}`). Catches
 * top-level `price`/`salePrice`/`costOfGoodsSold` and nested ones like
 * `shipping[].price`; `shippingWeight`/`unitPricingMeasure` carry `unit` (not
 * `currency`) so they're left untouched. An unparseable value is left as-is and a
 * warning recorded — `gmc preflight` then flags it downstream rather than us
 * silently losing data.
 */
function convertPrices(val: unknown, path: string, warnings: string[]): unknown {
  if (Array.isArray(val)) {
    return val.map((v, i) => convertPrices(v, `${path}[${i}]`, warnings));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (isPriceShape(obj)) {
      const micros = toMicros(obj.value);
      if (micros === null) {
        warnings.push(`${path}: price value "${String(obj.value)}" is not a non-negative number`);
        return obj;
      }
      const price: Price = { amountMicros: micros, currencyCode: obj.currency };
      return price;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = convertPrices(v, `${path}.${k}`, warnings);
    return out;
  }
  return val;
}

/**
 * Split a Content API REST product id (`{channel}:{contentLanguage}:{target}:{offerId}`)
 * into its parts. The 3rd segment (historically `targetCountry`) maps to `feedLabel`.
 * The offerId may itself contain colons, so it's the rejoined remainder. Returns an
 * empty object for an id that isn't in this 4+-segment form.
 */
export function parseContentApiId(id: string): {
  channel?: string;
  contentLanguage?: string;
  feedLabel?: string;
  offerId?: string;
} {
  const parts = id.split(":");
  if (parts.length < 4) return {};
  const [channel, contentLanguage, feedLabel, ...rest] = parts;
  return { channel, contentLanguage, feedLabel, offerId: rest.join(":") };
}

/**
 * Transform one Content API v2.1 product into a Merchant API `ProductInput`.
 * Returns `{ error }` when the input isn't a usable product object (not an object,
 * or no `offerId` derivable from the fields or the `id`).
 */
export function transformProduct(raw: unknown): ProductTransformResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "not a JSON object" };
  }
  const src = raw as Record<string, unknown>;
  const remapped: string[] = [];
  const dropped: string[] = [];
  const warnings: string[] = [];

  const fromId = typeof src["id"] === "string" ? parseContentApiId(src["id"]) : {};

  const offerId = strOr(src["offerId"]) ?? fromId.offerId;
  if (!offerId) return { error: "no offerId (and none derivable from id)" };

  // targetCountry → feedLabel: prefer an explicit feedLabel, else targetCountry, else the id segment.
  const explicitFeedLabel = strOr(src["feedLabel"]);
  const targetCountry = strOr(src["targetCountry"]);
  if (!explicitFeedLabel && targetCountry) {
    remapped.push(`targetCountry "${targetCountry}" → feedLabel`);
  }

  const input: ProductInput = { offerId };
  const channel = strOr(src["channel"]) ?? fromId.channel ?? "online";
  input.channel = channel;
  const contentLanguage = strOr(src["contentLanguage"]) ?? fromId.contentLanguage;
  if (contentLanguage) input.contentLanguage = contentLanguage;
  const feedLabel = explicitFeedLabel ?? targetCountry ?? fromId.feedLabel;
  if (feedLabel) input.feedLabel = feedLabel;

  // Carry customAttributes through unchanged (same shape in both APIs).
  if (Array.isArray(src["customAttributes"])) {
    input.customAttributes = src["customAttributes"] as CustomAttribute[];
  }

  // Hoist every remaining field into attributes, converting prices to micros.
  const attributes: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(src)) {
    if (IDENTITY_FIELDS.has(key)) continue;
    if (DROP_FIELDS.has(key)) {
      dropped.push(key);
      continue;
    }
    let value = convertPrices(val, key, warnings);
    // The Merchant API enum uses underscores (`in_stock`) where Content API used
    // spaces (`in stock`). Only normalize when the result is a real enum value —
    // an unrecognized value is left as-is so `gmc preflight` flags it rather than
    // us inventing an invalid enum (e.g. "pre order" → "pre_order").
    if (key === "availability" && typeof value === "string") {
      const norm = value.trim().toLowerCase().replace(/\s+/g, "_");
      if (norm !== value && AVAILABILITY_ENUM.has(norm)) {
        remapped.push(`availability "${value}" → "${norm}"`);
        value = norm;
      }
    }
    attributes[key] = value;
  }
  if (Object.keys(attributes).length > 0) {
    // The Merchant API accepts more attributes than ProductAttributes models; the
    // typed view is intentionally partial (see @gmc-cli/api products.ts), so cast.
    input.attributes = attributes as ProductInput["attributes"];
  }

  return { input, remapped, dropped, warnings };
}
