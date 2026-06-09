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

describe("required.price", () => {
  it("flags a missing price or amount", () => {
    expect(check("required.price", { offerId: "x" })).toHaveLength(1);
    expect(check("required.price", { attributes: { price: {} } })).toHaveLength(1);
    expect(
      check("required.price", { attributes: { price: { currencyCode: "USD" } } }),
    ).toHaveLength(1);
    expect(
      check("required.price", {
        attributes: { price: { amountMicros: "1000", currencyCode: "USD" } },
      }),
    ).toHaveLength(0);
  });
});

describe("rule shape", () => {
  it("every rule has a stable dotted id and default severity", () => {
    for (const r of requiredRules) {
      expect(r.id).toMatch(/^required\.[a-z-]+$/);
      expect(["error", "warning", "info"]).toContain(r.defaultSeverity);
    }
  });
});
