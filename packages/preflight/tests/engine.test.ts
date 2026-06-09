import { describe, it, expect } from "vitest";
import type { ProductInput } from "@gmc-cli/api";
import { runPreflight, productKey, PREFLIGHT_EXIT_CODE, type Rule } from "../src/index.js";

const errRule: Rule = {
  id: "test.err",
  title: "always errors on bad",
  defaultSeverity: "error",
  check: (p) => (p.offerId === "bad" ? [{ attribute: "offerId", message: "boom" }] : []),
};
const warnRule: Rule = {
  id: "test.warn",
  title: "always warns",
  defaultSeverity: "warning",
  check: () => [{ message: "meh" }],
};

const product = (offerId: string): ProductInput => ({
  offerId,
  channel: "ONLINE",
  contentLanguage: "en",
  feedLabel: "US",
});

describe("runPreflight", () => {
  it("passes with no findings (exit 0)", () => {
    const report = runPreflight([product("ok")], {}, [errRule]);
    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.scanned).toBe(1);
    expect(report.findings).toHaveLength(0);
    expect(report.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it("fails with an error finding (exit 6)", () => {
    const report = runPreflight([product("bad")], {}, [errRule]);
    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(PREFLIGHT_EXIT_CODE);
    expect(report.counts.error).toBe(1);
    expect(report.findings[0]).toMatchObject({
      ruleId: "test.err",
      severity: "error",
      offerId: "bad",
      productKey: "ONLINE~en~US~bad",
      attribute: "offerId",
    });
  });

  it("warnings don't fail by default but do under strict", () => {
    const lax = runPreflight([product("a")], {}, [warnRule]);
    expect(lax.ok).toBe(true);
    expect(lax.exitCode).toBe(0);
    expect(lax.counts.warning).toBe(1);

    const strict = runPreflight([product("a")], { strict: true }, [warnRule]);
    expect(strict.ok).toBe(false);
    expect(strict.exitCode).toBe(PREFLIGHT_EXIT_CODE);
    expect(strict.counts).toEqual({ error: 0, warning: 1, info: 0 });
    expect(strict.strict).toBe(true);
  });

  it("config.rules overrides a rule's severity", () => {
    const report = runPreflight([product("a")], { rules: { "test.warn": "error" } }, [warnRule]);
    expect(report.counts).toEqual({ error: 1, warning: 0, info: 0 });
    expect(report.ok).toBe(false);
    expect(report.findings[0].severity).toBe("error");
  });

  it('"off" disables a rule', () => {
    const report = runPreflight([product("bad")], { rules: { "test.err": "off" } }, [errRule]);
    expect(report.findings).toHaveLength(0);
    expect(report.ok).toBe(true);
  });

  it("ignore skips a product entirely (not scanned, no findings)", () => {
    const report = runPreflight([product("bad"), product("ok")], { ignore: ["bad"] }, [errRule]);
    expect(report.scanned).toBe(1);
    expect(report.findings).toHaveLength(0);
  });

  it("sorts findings by product then rule id", () => {
    // errRule fires only on "bad"; warnRule always fires. Two products so both rules
    // produce findings — verifies cross-product order AND intra-product (err < warn).
    const report = runPreflight([product("bad"), product("aaa")], {}, [warnRule, errRule]);
    expect(report.findings.map((f) => `${f.productKey}/${f.ruleId}`)).toEqual([
      "ONLINE~en~US~aaa/test.warn",
      "ONLINE~en~US~bad/test.err",
      "ONLINE~en~US~bad/test.warn",
    ]);
  });

  it("a rule that throws becomes an error finding instead of crashing the run", () => {
    const boom: Rule = {
      id: "test.boom",
      title: "throws",
      defaultSeverity: "error",
      check: () => {
        throw new Error("kaboom");
      },
    };
    const report = runPreflight([product("a")], {}, [boom]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ ruleId: "test.boom", severity: "error" });
    expect(report.findings[0].message).toContain("kaboom");
    expect(report.ok).toBe(false);
  });

  it("runs the default registry and catches a missing title", () => {
    const report = runPreflight([
      { offerId: "x", attributes: { price: { amountMicros: "1", currencyCode: "USD" } } },
    ]);
    const ids = report.findings.map((f) => f.ruleId);
    expect(ids).toContain("required.title");
    expect(ids).not.toContain("required.price");
    expect(report.ok).toBe(false);
  });
});

describe("productKey", () => {
  it("joins the composite identity with empty segments for missing parts", () => {
    expect(productKey(product("sku"))).toBe("ONLINE~en~US~sku");
    expect(productKey({ offerId: "sku" })).toBe("~~~sku");
    expect(productKey({})).toBe("~~~");
  });
});
