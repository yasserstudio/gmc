import { describe, it, expect } from "vitest";
import { toMicros } from "../src/money.js";

describe("toMicros", () => {
  it.each([
    ["10.00", "10000000"],
    ["10", "10000000"],
    [10, "10000000"],
    ["49.99", "49990000"],
    ["10.999999", "10999999"],
    ["0", "0"],
    ["1000000.50", "1000000500000"],
  ])("converts %s → %s micros", (input, expected) => {
    expect(toMicros(input)).toBe(expected);
  });

  it("rounds half-up at the 7th fractional digit", () => {
    expect(toMicros("10.9999995")).toBe("11000000"); // carries into the integer
    expect(toMicros("0.9999995")).toBe("1000000"); // fraction-only carry ripples to the integer
    expect(toMicros("0.0000005")).toBe("1");
    expect(toMicros("1.0000004")).toBe("1000000"); // 4 rounds down
  });

  it("handles large integers without float error (BigInt)", () => {
    expect(toMicros("123456789012.50")).toBe("123456789012500000");
  });

  it.each(["-5", "abc", "", "1.2.3", "1e6", "$10"])("rejects %s as null", (input) => {
    expect(toMicros(input)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(toMicros(" 10 ")).toBe("10000000");
  });
});
