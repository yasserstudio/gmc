import { describe, it, expect } from "vitest";
import type { ProductInput } from "@gmc-cli/api";
import { requiredRules } from "../src/rules/required.js";

const rule = (id: string) => {
  const found = requiredRules.find((r) => r.id === id);
  if (!found) throw new Error(`no rule ${id}`);
  return found;
};
const check = (id: string, product: ProductInput) => rule(id).check(product, {});

describe("required.offer-id", () => {
  it("flags a missing or blank offer id", () => {
    expect(check("required.offer-id", {})).toHaveLength(1);
    expect(check("required.offer-id", { offerId: "  " })).toHaveLength(1);
    expect(check("required.offer-id", { offerId: "SKU1" })).toHaveLength(0);
  });
});

describe("required.title", () => {
  it("flags a missing or blank title", () => {
    expect(check("required.title", { offerId: "x" })).toHaveLength(1);
    expect(check("required.title", { attributes: { title: "" } })).toHaveLength(1);
    expect(check("required.title", { attributes: { title: "Shoe" } })).toHaveLength(0);
  });
});

describe("required.description", () => {
  it("flags a missing or blank description", () => {
    expect(check("required.description", { attributes: {} })).toHaveLength(1);
    expect(check("required.description", { attributes: { description: "  " } })).toHaveLength(1);
    expect(check("required.description", { attributes: { description: "A shoe." } })).toHaveLength(0);
  });
});

describe("required.link", () => {
  it("flags a missing link", () => {
    expect(check("required.link", { attributes: {} })).toHaveLength(1);
    expect(check("required.link", { attributes: { link: "https://x.com/p" } })).toHaveLength(0);
  });
});

describe("required.image-link", () => {
  it("flags a missing image link", () => {
    expect(check("required.image-link", { attributes: {} })).toHaveLength(1);
    expect(
      check("required.image-link", { attributes: { imageLink: "https://x.com/a.jpg" } }),
    ).toHaveLength(0);
  });
});

describe("required.availability", () => {
  it("flags missing availability", () => {
    expect(check("required.availability", { attributes: {} })).toHaveLength(1);
    expect(
      check("required.availability", { attributes: { availability: "in_stock" } }),
    ).toHaveLength(0);
  });
});

describe("required.price", () => {
  it("flags a missing price or amount only", () => {
    expect(check("required.price", { offerId: "x" })).toHaveLength(1);
    expect(check("required.price", { attributes: { price: {} } })).toHaveLength(1);
    expect(
      check("required.price", { attributes: { price: { currencyCode: "USD" } } }),
    ).toHaveLength(1);
    expect(check("required.price", { attributes: { price: { amountMicros: "1000" } } })).toHaveLength(
      0,
    );
  });

  it("does not flag a present-but-malformed amount (format.price-amount's job)", () => {
    expect(check("required.price", { attributes: { price: { amountMicros: "-5" } } })).toHaveLength(
      0,
    );
    // A numeric amountMicros (hand-edited file) must not throw the defensive parse.
    expect(
      check("required.price", {
        attributes: { price: { amountMicros: 1000 as unknown as string } },
      }),
    ).toHaveLength(0);
  });
});

describe("required.condition", () => {
  it("warns (not errors) when missing, passes when present", () => {
    expect(rule("required.condition").defaultSeverity).toBe("warning");
    expect(check("required.condition", { attributes: {} })).toHaveLength(1);
    expect(check("required.condition", { attributes: { condition: "new" } })).toHaveLength(0);
  });
});

describe("required.identifier-exists", () => {
  it("warns only when gtin, mpn, and brand are all absent", () => {
    expect(rule("required.identifier-exists").defaultSeverity).toBe("warning");
    expect(check("required.identifier-exists", { attributes: {} })).toHaveLength(1);
    expect(check("required.identifier-exists", { attributes: { brand: "Acme" } })).toHaveLength(0);
    expect(check("required.identifier-exists", { attributes: { gtin: "x" } })).toHaveLength(0);
    expect(check("required.identifier-exists", { attributes: { mpn: "x" } })).toHaveLength(0);
  });
});
