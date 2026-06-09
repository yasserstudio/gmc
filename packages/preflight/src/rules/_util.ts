// Shared helpers for the preflight rules. Kept in their own module (not in any one
// rule file) so the required/ and format/ rule sets import them without a cycle.

/** Merchant Center product data specification (all attributes). */
export const SPEC = "https://support.google.com/merchants/answer/7052112";

/** Unique product identifiers (gtin / mpn / brand / GTIN) documentation. */
export const IDENTIFIER_DOC = "https://support.google.com/merchants/answer/6324461";

/** Title & description editorial guidelines (no promotional text, gimmicky caps/symbols). */
export const EDITORIAL_DOC = "https://support.google.com/merchants/answer/6324415";

/**
 * Trim a possibly-non-string value; empty/whitespace counts as absent. Accepts
 * `unknown` because product JSON is third-party and may carry a non-string where the
 * type says string — a non-string, non-nullish value counts as *present* (the format
 * rules then report it as malformed; see {@link text}).
 */
export function blank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/**
 * Read an attribute as display text. Product JSON is third-party and may carry a
 * non-string where the type says string (a hand-edited number, a stray array), so
 * coerce rather than let `.trim()` throw — a malformed value then yields the rule's
 * real finding (e.g. "not a recognized value") instead of the engine's generic
 * "Rule failed" catch. Returns the trimmed text, or undefined for an absent/blank value.
 */
export function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = (typeof value === "string" ? value : String(value)).trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Render an untrusted value into a human-facing message: replace control characters
 * (newlines, ANSI escapes) with spaces so it can't forge or corrupt CLI/CI output,
 * and cap the length so a multi-megabyte attribute can't bloat the report.
 */
export function quote(value: string, max = 80): string {
  let clean = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    clean += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** True if `value` is a syntactically valid absolute http(s) URL. */
export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

/** The outcome of classifying a `price.amountMicros` value. */
export type MicrosParse =
  | { kind: "absent" }
  | { kind: "valid"; micros: number }
  | { kind: "invalid"; raw: string };

/**
 * Defensively classify a `price.amountMicros` value. The field is typed `string`,
 * but hand-edited feed files routinely carry a JSON number — rather than let that
 * throw inside a rule (which the engine would surface as a generic "Rule failed"),
 * classify it precisely so `required.price` and `format.price-amount` can each speak
 * to it:
 *
 * - `absent`  — undefined / null / empty string: no amount at all.
 * - `valid`   — a non-negative, safe integer count of micros (as a string or number).
 * - `invalid` — present but not a non-negative safe integer (negative, fractional,
 *               non-numeric, or beyond `Number.MAX_SAFE_INTEGER`); `raw` echoes it.
 */
export function parseMicros(amountMicros: unknown): MicrosParse {
  if (amountMicros === undefined || amountMicros === null) return { kind: "absent" };
  const raw = String(amountMicros).trim();
  if (raw === "") return { kind: "absent" };
  // Micros are an integer count of millionths — no decimals, no exponents.
  if (!/^[+-]?\d+$/.test(raw)) return { kind: "invalid", raw };
  const micros = Number(raw);
  if (!Number.isSafeInteger(micros) || micros < 0) return { kind: "invalid", raw };
  return { kind: "valid", micros };
}
