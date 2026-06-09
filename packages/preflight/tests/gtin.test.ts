import { describe, it, expect } from "vitest";
import { isValidGtin } from "../src/rules/gtin.js";

describe("isValidGtin", () => {
  it("accepts valid GTIN-8 / 12 / 13 / 14", () => {
    expect(isValidGtin("73513537")).toBe(true); // EAN-8
    expect(isValidGtin("036000291452")).toBe(true); // UPC-A (GTIN-12)
    expect(isValidGtin("4006381333931")).toBe(true); // EAN-13
    expect(isValidGtin("00012345678905")).toBe(true); // GTIN-14
  });

  it("tolerates surrounding whitespace", () => {
    expect(isValidGtin("  4006381333931 ")).toBe(true);
  });

  it("rejects bad check digits, unsupported lengths, and non-digits", () => {
    expect(isValidGtin("4006381333930")).toBe(false); // last digit should be 1
    expect(isValidGtin("12345")).toBe(false); // length 5
    expect(isValidGtin("123456789")).toBe(false); // length 9
    expect(isValidGtin("40063813339AB")).toBe(false); // non-digit
    expect(isValidGtin("")).toBe(false);
  });
});
