import { describe, it, expect } from "vitest";
import { scopesFor, MERCHANT_API_SCOPE } from "../src/scopes.js";

describe("scopesFor", () => {
  it("returns the default Merchant API scope when given no argument", () => {
    expect(scopesFor()).toEqual([MERCHANT_API_SCOPE]);
  });

  it("resolves a single sub-API to its scope", () => {
    expect(scopesFor("products")).toEqual([MERCHANT_API_SCOPE]);
  });

  it("deduplicates the union across multiple sub-APIs", () => {
    expect(scopesFor(["products", "accounts", "reports"])).toEqual([MERCHANT_API_SCOPE]);
  });

  it("falls back to the default scope for an empty selection", () => {
    expect(scopesFor([])).toEqual([MERCHANT_API_SCOPE]);
  });

  it("returns a fresh array the caller can mutate", () => {
    const a = scopesFor();
    a.push("x");
    expect(scopesFor()).toEqual([MERCHANT_API_SCOPE]);
  });
});
