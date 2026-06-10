import { describe, it, expect } from "vitest";
import {
  toMicros,
  parseContentApiId,
  transformProduct,
  isTransformError,
  type ProductTransform,
} from "../src/index.js";

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

describe("parseContentApiId", () => {
  it("splits the canonical 4-segment id", () => {
    expect(parseContentApiId("online:en:US:SKU1")).toEqual({
      channel: "online",
      contentLanguage: "en",
      feedLabel: "US",
      offerId: "SKU1",
    });
  });

  it("rejoins an offerId that contains colons", () => {
    expect(parseContentApiId("online:en:US:A:B").offerId).toBe("A:B");
  });

  it("returns empty for a non-conforming id", () => {
    expect(parseContentApiId("too:short")).toEqual({});
  });
});

function ok(raw: unknown): ProductTransform {
  const r = transformProduct(raw);
  if (isTransformError(r)) throw new Error(`expected success, got error: ${r.error}`);
  return r;
}

describe("transformProduct", () => {
  it("splits identity fields from attributes and converts price to micros", () => {
    const { input } = ok({
      offerId: "SKU1",
      channel: "online",
      contentLanguage: "en",
      targetCountry: "US",
      title: "Shoe",
      price: { value: "49.99", currency: "USD" },
    });
    expect(input).toMatchObject({
      offerId: "SKU1",
      channel: "online",
      contentLanguage: "en",
      feedLabel: "US",
    });
    expect(input.attributes).toMatchObject({
      title: "Shoe",
      price: { amountMicros: "49990000", currencyCode: "USD" },
    });
    // identity fields are NOT duplicated into attributes
    expect((input.attributes as Record<string, unknown>)["targetCountry"]).toBeUndefined();
  });

  it("remaps targetCountry → feedLabel and reports it", () => {
    const r = ok({ offerId: "X", targetCountry: "GB" });
    expect(r.input.feedLabel).toBe("GB");
    expect(r.remapped).toContain('targetCountry "GB" → feedLabel');
  });

  it("prefers an explicit feedLabel over targetCountry", () => {
    const r = ok({ offerId: "X", feedLabel: "US-en", targetCountry: "US" });
    expect(r.input.feedLabel).toBe("US-en");
    expect(r.remapped).toHaveLength(0);
  });

  it("normalizes the availability enum (spaces → underscores)", () => {
    const r = ok({ offerId: "X", availability: "in stock" });
    expect((r.input.attributes as Record<string, unknown>)["availability"]).toBe("in_stock");
    expect(r.remapped).toContain('availability "in stock" → "in_stock"');
  });

  it("leaves an already-valid availability untouched (no remap note)", () => {
    const r = ok({ offerId: "X", availability: "preorder" });
    expect((r.input.attributes as Record<string, unknown>)["availability"]).toBe("preorder");
    expect(r.remapped).toHaveLength(0);
  });

  it("does not invent an invalid availability — leaves it for preflight to flag", () => {
    const r = ok({ offerId: "X", availability: "pre order" });
    expect((r.input.attributes as Record<string, unknown>)["availability"]).toBe("pre order");
    expect(r.remapped).toHaveLength(0);
  });

  it("converts nested shipping[].price and leaves shippingWeight alone", () => {
    const { input } = ok({
      offerId: "X",
      shipping: [{ country: "US", price: { value: "5.00", currency: "USD" } }],
      shippingWeight: { value: "1.2", unit: "kg" },
    });
    const attrs = input.attributes as Record<string, unknown>;
    expect((attrs["shipping"] as { price: unknown }[])[0].price).toEqual({
      amountMicros: "5000000",
      currencyCode: "USD",
    });
    expect(attrs["shippingWeight"]).toEqual({ value: "1.2", unit: "kg" });
  });

  it("carries customAttributes through unchanged", () => {
    const { input } = ok({ offerId: "X", customAttributes: [{ name: "size", value: "42" }] });
    expect(input.customAttributes).toEqual([{ name: "size", value: "42" }]);
  });

  it("derives identity from the Content API id when fields are absent, and drops id/kind", () => {
    const r = ok({ id: "online:en:US:SKU9", kind: "content#product", title: "T" });
    expect(r.input).toMatchObject({ offerId: "SKU9", channel: "online", contentLanguage: "en", feedLabel: "US" });
    expect(r.dropped).toEqual(expect.arrayContaining(["id", "kind"]));
  });

  it("warns and leaves an unparseable price for preflight to flag", () => {
    const r = ok({ offerId: "X", price: { value: "free", currency: "USD" } });
    expect(r.warnings.some((w) => w.includes("price"))).toBe(true);
    // left as-is, not converted
    expect((r.input.attributes as Record<string, unknown>)["price"]).toEqual({
      value: "free",
      currency: "USD",
    });
  });

  it("defaults channel to online", () => {
    expect(ok({ offerId: "X" }).input.channel).toBe("online");
  });

  it.each([
    ["not an object", "nope"],
    ["an array", []],
    ["null", null],
  ])("errors on %s", (_label, value) => {
    const r = transformProduct(value);
    expect(isTransformError(r)).toBe(true);
  });

  it("errors when no offerId is derivable", () => {
    const r = transformProduct({ title: "no id" });
    expect(isTransformError(r) && r.error).toContain("offerId");
  });
});
