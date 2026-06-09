import { describe, it, expect } from "vitest";
import type { ProductInput, Price } from "@gmc-cli/api";
import { formatRules } from "../src/rules/format.js";

const rule = (id: string) => {
  const found = formatRules.find((r) => r.id === id);
  if (!found) throw new Error(`no rule ${id}`);
  return found;
};
const check = (id: string, product: ProductInput) => rule(id).check(product, {});

describe("format.link-url / format.image-link-url", () => {
  it("passes valid http(s) URLs, flags malformed, ignores absent", () => {
    expect(check("format.link-url", { attributes: {} })).toHaveLength(0);
    expect(check("format.link-url", { attributes: { link: "https://x.com/p" } })).toHaveLength(0);
    expect(check("format.link-url", { attributes: { link: "http://x.com" } })).toHaveLength(0);
    expect(check("format.link-url", { attributes: { link: "ftp://x.com" } })).toHaveLength(1);
    expect(check("format.link-url", { attributes: { link: "not a url" } })).toHaveLength(1);

    expect(
      check("format.image-link-url", { attributes: { imageLink: "https://x.com/a.jpg" } }),
    ).toHaveLength(0);
    expect(
      check("format.image-link-url", { attributes: { imageLink: "/relative.jpg" } }),
    ).toHaveLength(1);
  });
});

describe("format.price-amount", () => {
  const c = (amountMicros: unknown) =>
    check("format.price-amount", {
      attributes: { price: { amountMicros: amountMicros as string } },
    });

  it("flags only a present-but-malformed amount", () => {
    expect(check("format.price-amount", { attributes: {} })).toHaveLength(0); // absent
    expect(c("")).toHaveLength(0); // empty == absent
    expect(c("49990000")).toHaveLength(0);
    expect(c(49990000)).toHaveLength(0); // numeric tolerated
    expect(c("-5")).toHaveLength(1); // negative
    expect(c("4.99")).toHaveLength(1); // fractional
    expect(c("abc")).toHaveLength(1); // non-numeric
  });
});

describe("format.price-currency", () => {
  const c = (price: Price) => check("format.price-currency", { attributes: { price } });

  it("only fires when an amount is present", () => {
    expect(check("format.price-currency", { attributes: {} })).toHaveLength(0);
    expect(c({ currencyCode: "USD" })).toHaveLength(0); // no amount → not our job
  });

  it("flags a missing or malformed currency alongside a valid amount", () => {
    expect(c({ amountMicros: "1000" })).toHaveLength(1); // missing
    expect(c({ amountMicros: "1000", currencyCode: "US" })).toHaveLength(1); // too short
    expect(c({ amountMicros: "1000", currencyCode: "US1" })).toHaveLength(1); // non-alpha
    expect(c({ amountMicros: "1000", currencyCode: "usd" })).toHaveLength(0); // 3 letters ok
  });

  it("does not pile on when the amount itself is malformed", () => {
    // A broken amount is format.price-amount's finding — the currency rule stays quiet.
    expect(c({ amountMicros: "-5" })).toHaveLength(0);
    expect(c({ amountMicros: "abc", currencyCode: "ZZ" })).toHaveLength(0);
  });
});

describe("format.availability-enum", () => {
  const c = (availability: string) =>
    check("format.availability-enum", { attributes: { availability } });

  it("accepts canonical values and case/space variants, flags the rest", () => {
    expect(check("format.availability-enum", { attributes: {} })).toHaveLength(0);
    expect(c("in_stock")).toHaveLength(0);
    expect(c("In Stock")).toHaveLength(0); // normalized
    expect(c("backorder")).toHaveLength(0);
    expect(c("available")).toHaveLength(1);
  });
});

describe("format.condition-enum", () => {
  const c = (condition: string) => check("format.condition-enum", { attributes: { condition } });

  it("accepts new/refurbished/used (any case), flags the rest", () => {
    expect(c("new")).toHaveLength(0);
    expect(c("Refurbished")).toHaveLength(0);
    expect(c("like new")).toHaveLength(1);
  });
});

describe("format.gtin-checksum", () => {
  const c = (gtin: string) => check("format.gtin-checksum", { attributes: { gtin } });

  it("passes valid GTINs and flags bad check digits (as a warning)", () => {
    expect(rule("format.gtin-checksum").defaultSeverity).toBe("warning");
    expect(check("format.gtin-checksum", { attributes: {} })).toHaveLength(0);
    expect(c("4006381333931")).toHaveLength(0); // valid EAN-13
    expect(c("036000291452")).toHaveLength(0); // valid UPC-A
    expect(c("4006381333930")).toHaveLength(1); // bad check digit
    expect(c("12345")).toHaveLength(1); // wrong length
  });
});

describe("non-string values (hand-edited feeds) yield real findings, not crashes", () => {
  it("coerces a non-string attribute and flags it instead of throwing", () => {
    expect(
      check("format.availability-enum", {
        attributes: { availability: 0 as unknown as string },
      }),
    ).toHaveLength(1); // "0" is not a recognized value
    expect(
      check("format.link-url", { attributes: { link: ["x"] as unknown as string } }),
    ).toHaveLength(1);
  });
});

describe("format length limits", () => {
  it("warns past the cap, passes within (and ignores absent)", () => {
    expect(rule("format.title-length").defaultSeverity).toBe("warning");
    expect(check("format.title-length", { attributes: {} })).toHaveLength(0);
    expect(check("format.title-length", { attributes: { title: "x".repeat(150) } })).toHaveLength(0);
    expect(check("format.title-length", { attributes: { title: "x".repeat(151) } })).toHaveLength(1);
    expect(
      check("format.description-length", { attributes: { description: "x".repeat(5000) } }),
    ).toHaveLength(0);
    expect(
      check("format.description-length", { attributes: { description: "x".repeat(5001) } }),
    ).toHaveLength(1);
  });
});
