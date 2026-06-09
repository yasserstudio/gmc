// GTIN check-digit validation (GTIN-8 / 12 / 13 / 14, i.e. EAN / UPC). Pure — used
// by the `format.gtin-checksum` rule. A valid GTIN is all digits of a supported
// length whose final digit is the standard GS1 mod-10 check digit of the digits
// before it.

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/**
 * True if `value` is a structurally valid GTIN: digits only (interior whitespace
 * tolerated), a length of 8/12/13/14, and a correct mod-10 check digit. Weights
 * alternate 3, 1, 3, 1, … starting from the rightmost data digit, independent of
 * overall length — so the same routine validates every GTIN size.
 */
export function isValidGtin(value: string): boolean {
  const digits = value.replace(/\s+/g, "");
  if (!/^\d+$/.test(digits) || !GTIN_LENGTHS.has(digits.length)) return false;

  const nums = Array.from(digits, (d) => Number(d));
  // Walk the data digits (all but the trailing check digit) right-to-left, weighting
  // 3, 1, 3, 1, … — `forEach` types each element as a plain number, so no index math.
  let sum = 0;
  nums
    .slice(0, -1)
    .reverse()
    .forEach((digit, i) => {
      sum += digit * (i % 2 === 0 ? 3 : 1);
    });
  const expected = (10 - (sum % 10)) % 10;
  return expected === nums[nums.length - 1];
}
