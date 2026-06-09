import { describe, it, expect } from "vitest";
import { RULES } from "../src/rules/index.js";
import { requiredRules } from "../src/rules/required.js";
import { formatRules } from "../src/rules/format.js";

describe("rule registry", () => {
  it("is exactly required + format, concatenated", () => {
    expect(RULES).toHaveLength(requiredRules.length + formatRules.length);
  });

  it("every rule has a unique, well-formed id and a valid default severity", () => {
    const ids = new Set<string>();
    for (const r of RULES) {
      expect(r.id).toMatch(/^(required|format)\.[a-z-]+$/);
      expect(["error", "warning", "info"]).toContain(r.defaultSeverity);
      expect(r.title.length).toBeGreaterThan(0);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
  });

  it("every rule returns an array on an empty product (no throws)", () => {
    for (const r of RULES) {
      expect(Array.isArray(r.check({}, {}))).toBe(true);
    }
  });
});
