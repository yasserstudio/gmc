import { describe, it, expect } from "vitest";
import type { ProductInput } from "@gmc-cli/api";
import { policyRules } from "../src/rules/policy.js";

const rule = (id: string) => {
  const found = policyRules.find((r) => r.id === id);
  if (!found) throw new Error(`no rule ${id}`);
  return found;
};
const check = (id: string, product: ProductInput) => rule(id).check(product, {});
const title = (t: string): ProductInput => ({ productAttributes: { title: t } });

describe("policy.promotional-title", () => {
  it("is an error and flags promotional phrases, not legit names", () => {
    expect(rule("policy.promotional-title").defaultSeverity).toBe("error");
    expect(check("policy.promotional-title", title("Nike Air Max — FREE SHIPPING"))).toHaveLength(
      1,
    );
    expect(check("policy.promotional-title", title("Mattress 20% off today"))).toHaveLength(1);
    expect(check("policy.promotional-title", title("Save 30% on Socks"))).toHaveLength(1);
    expect(check("policy.promotional-title", title("Running Shoes Best Price"))).toHaveLength(1);
    // precision — must NOT trip
    expect(check("policy.promotional-title", title("Free Solo Climbing Shoe"))).toHaveLength(0);
    expect(check("policy.promotional-title", title("Wholesale Cotton Socks"))).toHaveLength(0);
    expect(check("policy.promotional-title", title("100% Cotton T-Shirt"))).toHaveLength(0); // % without "off"
    expect(check("policy.promotional-title", title(""))).toHaveLength(0);
    expect(check("policy.promotional-title", {})).toHaveLength(0);
  });
});

describe("policy title rules ignore an absent title", () => {
  it("returns no findings when title is missing", () => {
    for (const id of ["policy.title-caps", "policy.title-symbols", "policy.phone-in-title"]) {
      expect(check(id, {})).toHaveLength(0);
      expect(check(id, title(""))).toHaveLength(0);
    }
  });
});

describe("policy.title-caps", () => {
  it("warns on shouting titles, not acronym brands or short titles", () => {
    expect(rule("policy.title-caps").defaultSeverity).toBe("warning");
    expect(check("policy.title-caps", title("BEST RUNNING SHOES EVER"))).toHaveLength(1);
    expect(check("policy.title-caps", title("ASUS ROG Strix Laptop"))).toHaveLength(0);
    expect(check("policy.title-caps", title("Nike Air Zoom Pegasus"))).toHaveLength(0);
    expect(check("policy.title-caps", title("USB Cable"))).toHaveLength(0); // < 12 letters
  });
});

describe("policy.title-symbols", () => {
  it("warns on emoji, repeated punctuation, and decorative glyphs", () => {
    expect(rule("policy.title-symbols").defaultSeverity).toBe("warning");
    expect(check("policy.title-symbols", title("Cool Shoes 🔥🔥"))).toHaveLength(1);
    expect(check("policy.title-symbols", title("Cool Shoes!!!"))).toHaveLength(1);
    expect(check("policy.title-symbols", title("★ Premium Watch ★"))).toHaveLength(1);
    expect(check("policy.title-symbols", title("Men's Running Shoes (Blue)"))).toHaveLength(0);
    expect(check("policy.title-symbols", title("T-Shirt, Size M"))).toHaveLength(0);
  });
});

describe("policy.phone-in-title", () => {
  it("warns on formatted phone numbers, not model numbers", () => {
    expect(rule("policy.phone-in-title").defaultSeverity).toBe("warning");
    expect(check("policy.phone-in-title", title("Shoes — call 555-123-4567"))).toHaveLength(1);
    expect(check("policy.phone-in-title", title("Call (800) 555-1212 now"))).toHaveLength(1);
    expect(check("policy.phone-in-title", title("Widget +1 415 555 2671"))).toHaveLength(1);
    expect(check("policy.phone-in-title", title("Bracket Model ABC-12345678"))).toHaveLength(0);
    expect(check("policy.phone-in-title", title("Cable 100-240V 50-60Hz"))).toHaveLength(0);
  });
});

describe("policy.link-https", () => {
  it("warns on http, passes https / absent / malformed", () => {
    expect(rule("policy.link-https").defaultSeverity).toBe("warning");
    expect(
      check("policy.link-https", { productAttributes: { link: "http://x.com/p" } }),
    ).toHaveLength(1);
    expect(
      check("policy.link-https", { productAttributes: { link: "https://x.com/p" } }),
    ).toHaveLength(0);
    expect(check("policy.link-https", { productAttributes: { link: "not a url" } })).toHaveLength(
      0,
    );
    expect(check("policy.link-https", {})).toHaveLength(0);
  });
});
