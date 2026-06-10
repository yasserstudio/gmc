// Money helpers for the Merchant API. The API expresses prices as integer micros
// (a `Price.amountMicros` string = the amount × 1,000,000); `toMicros` converts a
// human decimal to that wire format. Lives next to the `Price` type it produces so
// any consumer of @gmc-cli/api (the migrate transform, the inventory command, …)
// shares one implementation.

/**
 * Convert a decimal price (string or number) to integer micros (value × 1,000,000),
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
