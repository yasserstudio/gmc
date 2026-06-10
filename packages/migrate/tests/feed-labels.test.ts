import { describe, it, expect } from "vitest";
import { checkFeedLabels, type FeedLabelProduct, type FeedLabelSource } from "../src/index.js";

const p = (feedLabel?: string, extra: Partial<FeedLabelProduct> = {}): FeedLabelProduct => ({
  contentLanguage: "en",
  ...(feedLabel !== undefined ? { feedLabel } : {}),
  ...extra,
});

const src = (feedLabel: string, extra: Partial<FeedLabelSource> = {}): FeedLabelSource => ({
  contentLanguage: "en",
  feedLabel,
  ...extra,
});

function findingIds(r: ReturnType<typeof checkFeedLabels>): string[] {
  return r.findings.map((f) => f.ruleId);
}

describe("checkFeedLabels", () => {
  it("groups products by (feedLabel, contentLanguage)", () => {
    const r = checkFeedLabels([p("US"), p("US"), p("CA")]);
    expect(r.scanned).toBe(3);
    expect(r.groups).toHaveLength(2);
    expect(r.groups.find((g) => g.feedLabel === "US")?.count).toBe(2);
    expect(r.groups.find((g) => g.feedLabel === "CA")?.count).toBe(1);
  });

  it("flags a product with no feedLabel as an error", () => {
    const r = checkFeedLabels([p(undefined), p("US")]);
    expect(findingIds(r)).toContain("feed-label.missing");
    expect(r.counts.error).toBe(1);
    expect(r.ok).toBe(false);
  });

  it("warns on case variants of the same label", () => {
    const r = checkFeedLabels([p("US"), p("us")]);
    const cv = r.findings.find((f) => f.ruleId === "feed-label.case-variant");
    expect(cv).toBeDefined();
    expect(cv?.severity).toBe("warning");
    expect(cv?.message).toContain('"US"');
    expect(cv?.message).toContain('"us"');
  });

  it("does not run cross-check rules when no dataSources are supplied (offline)", () => {
    const r = checkFeedLabels([p("CA")]); // no data sources
    expect(r.crossChecked).toBe(false);
    expect(findingIds(r)).not.toContain("feed-label.unmatched");
    expect(r.groups[0]?.matched).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it("flags a group matching no data source as an error (the campaign-killer)", () => {
    const r = checkFeedLabels([p("US"), p("CA")], { dataSources: [src("US")] });
    expect(r.crossChecked).toBe(true);
    const unmatched = r.findings.find((f) => f.ruleId === "feed-label.unmatched");
    expect(unmatched?.feedLabel).toBe("CA");
    expect(r.groups.find((g) => g.feedLabel === "US")?.matched).toBe(true);
    expect(r.groups.find((g) => g.feedLabel === "CA")?.matched).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("passes when every group matches a data source", () => {
    const r = checkFeedLabels([p("US"), p("CA")], { dataSources: [src("US"), src("CA")] });
    expect(findingIds(r)).not.toContain("feed-label.unmatched");
    expect(r.counts.error).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("requires contentLanguage to match too", () => {
    const r = checkFeedLabels([p("US")], { dataSources: [src("US", { contentLanguage: "fr" })] });
    expect(findingIds(r)).toContain("feed-label.unmatched");
  });

  it("reports an orphaned data source as info (non-gating)", () => {
    const r = checkFeedLabels([p("US")], { dataSources: [src("US"), src("GB")] });
    const orphan = r.findings.find((f) => f.ruleId === "feed-label.orphaned-source");
    expect(orphan?.severity).toBe("info");
    expect(orphan?.feedLabel).toBe("GB");
    expect(r.ok).toBe(true); // info doesn't gate
  });

  it("strict mode counts warnings as failures", () => {
    const lenient = checkFeedLabels([p("US"), p("us")], { dataSources: [src("US"), src("us")] });
    expect(lenient.counts.warning).toBe(1);
    expect(lenient.ok).toBe(true);
    const strict = checkFeedLabels([p("US"), p("us")], {
      dataSources: [src("US"), src("us")],
      strict: true,
    });
    expect(strict.ok).toBe(false);
  });

  it("treats every group as unmatched when the account has zero primary sources", () => {
    const r = checkFeedLabels([p("US")], { dataSources: [] });
    expect(r.crossChecked).toBe(true);
    expect(findingIds(r)).toContain("feed-label.unmatched");
    expect(r.ok).toBe(false);
  });

  it("reports a missing-feedLabel group as missing, not also unmatched", () => {
    const r = checkFeedLabels([p(undefined)], { dataSources: [src("US")] });
    expect(findingIds(r)).toContain("feed-label.missing");
    expect(findingIds(r)).not.toContain("feed-label.unmatched");
  });

  it("does not collide identities that would merge under a naive space-join", () => {
    // ("x y","z") vs ("x","y z") both become "x y z" if joined by spaces.
    const a: FeedLabelProduct = { feedLabel: "x y", contentLanguage: "z" };
    const b: FeedLabelProduct = { feedLabel: "x", contentLanguage: "y z" };
    const r = checkFeedLabels([a, b]);
    expect(r.groups).toHaveLength(2);
  });

  it("handles an empty feed", () => {
    const r = checkFeedLabels([]);
    expect(r.scanned).toBe(0);
    expect(r.groups).toHaveLength(0);
    expect(r.ok).toBe(true);
  });
});
