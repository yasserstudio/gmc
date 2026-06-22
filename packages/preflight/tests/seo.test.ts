import { describe, it, expect } from "vitest";
import type { ProductInput } from "@gmc-cli/api";
import { seoRules } from "../src/rules/seo.js";

const rule = (id: string) => {
  const found = seoRules.find((r) => r.id === id);
  if (!found) throw new Error(`no rule ${id}`);
  return found;
};
const check = (id: string, product: ProductInput) => rule(id).check(product, {});

const product = (attrs: Record<string, unknown>): ProductInput => ({
  productAttributes: attrs as ProductInput["productAttributes"],
});

describe("seo.title-length", () => {
  it("defaults to info severity", () => {
    expect(rule("seo.title-length").defaultSeverity).toBe("info");
  });

  it("flags titles that are too short", () => {
    expect(check("seo.title-length", product({ title: "Shoes" }))).toHaveLength(1);
    expect(check("seo.title-length", product({ title: "A".repeat(29) }))).toHaveLength(1);
  });

  it("passes titles at or above the minimum", () => {
    expect(
      check(
        "seo.title-length",
        product({ title: "Nike Air Max 90 Running Shoes — Black/White, Men's Size 10" }),
      ),
    ).toHaveLength(0);
    expect(check("seo.title-length", product({ title: "A".repeat(30) }))).toHaveLength(0);
    expect(check("seo.title-length", product({ title: "A".repeat(150) }))).toHaveLength(0);
    expect(check("seo.title-length", product({ title: "A".repeat(200) }))).toHaveLength(0);
  });

  it("skips absent/empty titles", () => {
    expect(check("seo.title-length", product({}))).toHaveLength(0);
    expect(check("seo.title-length", product({ title: "" }))).toHaveLength(0);
  });
});

describe("seo.title-brand", () => {
  it("flags when brand is missing from title", () => {
    expect(
      check("seo.title-brand", product({ title: "Running Shoes Black Size 10", brand: "Nike" })),
    ).toHaveLength(1);
  });

  it("passes when brand is in the title (case-insensitive)", () => {
    expect(
      check("seo.title-brand", product({ title: "nike Air Max 90 Running Shoes", brand: "Nike" })),
    ).toHaveLength(0);
  });

  it("skips when brand or title is absent", () => {
    expect(check("seo.title-brand", product({ title: "Running Shoes" }))).toHaveLength(0);
    expect(check("seo.title-brand", product({ brand: "Nike" }))).toHaveLength(0);
    expect(check("seo.title-brand", product({}))).toHaveLength(0);
  });
});

describe("seo.title-attributes", () => {
  it("flags when color/size are set but not in title", () => {
    const findings = check(
      "seo.title-attributes",
      product({ title: "Nike Air Max Running Shoes", color: "Black", size: "10" }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("color");
    expect(findings[0].message).toContain("size");
  });

  it("passes when attributes are in the title", () => {
    expect(
      check(
        "seo.title-attributes",
        product({ title: "Nike Air Max — Black, Size 10", color: "Black", size: "10" }),
      ),
    ).toHaveLength(0);
  });

  it("skips when no color or size is set", () => {
    expect(
      check("seo.title-attributes", product({ title: "Nike Air Max Running Shoes" })),
    ).toHaveLength(0);
  });
});

describe("seo.description-length", () => {
  it("flags short descriptions", () => {
    expect(check("seo.description-length", product({ description: "A nice shoe." }))).toHaveLength(
      1,
    );
  });

  it("passes descriptions at or above the minimum", () => {
    expect(check("seo.description-length", product({ description: "A".repeat(500) }))).toHaveLength(
      0,
    );
    expect(
      check("seo.description-length", product({ description: "A".repeat(5000) })),
    ).toHaveLength(0);
    expect(
      check("seo.description-length", product({ description: "A".repeat(10000) })),
    ).toHaveLength(0);
  });

  it("skips absent descriptions", () => {
    expect(check("seo.description-length", product({}))).toHaveLength(0);
  });
});

describe("seo.title-equals-description", () => {
  it("flags identical title and description", () => {
    expect(
      check(
        "seo.title-equals-description",
        product({ title: "Nike Running Shoes", description: "nike running shoes" }),
      ),
    ).toHaveLength(1);
  });

  it("passes when they differ", () => {
    expect(
      check(
        "seo.title-equals-description",
        product({
          title: "Nike Running Shoes",
          description: "Premium Nike running shoes for daily training.",
        }),
      ),
    ).toHaveLength(0);
  });

  it("skips when either is absent", () => {
    expect(check("seo.title-equals-description", product({ title: "Shoes" }))).toHaveLength(0);
    expect(check("seo.title-equals-description", product({ description: "Shoes" }))).toHaveLength(
      0,
    );
  });
});

describe("seo.description-has-brand", () => {
  it("flags when brand is not in description", () => {
    expect(
      check(
        "seo.description-has-brand",
        product({ description: "Great running shoes for athletes.", brand: "Nike" }),
      ),
    ).toHaveLength(1);
  });

  it("passes when brand is mentioned", () => {
    expect(
      check(
        "seo.description-has-brand",
        product({ description: "Great Nike running shoes for athletes.", brand: "Nike" }),
      ),
    ).toHaveLength(0);
  });

  it("skips when brand or description is absent", () => {
    expect(check("seo.description-has-brand", product({ brand: "Nike" }))).toHaveLength(0);
    expect(
      check("seo.description-has-brand", product({ description: "Some shoes." })),
    ).toHaveLength(0);
  });
});

describe("seo.image-placeholder", () => {
  it("flags placeholder image URLs", () => {
    expect(
      check(
        "seo.image-placeholder",
        product({ imageLink: "https://example.com/images/placeholder.jpg" }),
      ),
    ).toHaveLength(1);
    expect(
      check("seo.image-placeholder", product({ imageLink: "https://example.com/no-image.png" })),
    ).toHaveLength(1);
    expect(
      check(
        "seo.image-placeholder",
        product({ imageLink: "https://example.com/default_image.jpg" }),
      ),
    ).toHaveLength(1);
  });

  it("passes real image URLs", () => {
    expect(
      check(
        "seo.image-placeholder",
        product({ imageLink: "https://cdn.example.com/products/nike-air-max-90-black.jpg" }),
      ),
    ).toHaveLength(0);
  });

  it("skips absent images", () => {
    expect(check("seo.image-placeholder", product({}))).toHaveLength(0);
  });
});
