// The feed-label half of `gmc migrate` (v0.9.8) — the "silent campaign-killer"
// check. Google Ads Shopping campaigns target products by their feed identity
// `(channel, feedLabel, contentLanguage)` — the same tuple a primary data source
// is keyed by. After migration, a product whose feed identity matches no data
// source lands in a feed no campaign targets and silently stops serving. This
// pure engine groups products by that tuple, validates the labels, and (when the
// caller supplies the account's data sources) flags groups that match none. The
// CLI does all I/O (loading the feed, listing data sources, rendering, exit code).

/** A product reduced to its feed identity. */
export interface FeedLabelProduct {
  channel?: string;
  feedLabel?: string;
  contentLanguage?: string;
  offerId?: string;
}

/** A primary data source's feed identity, for the cross-check. */
export interface FeedLabelSource {
  channel?: string;
  feedLabel?: string;
  contentLanguage?: string;
}

export type FeedLabelSeverity = "error" | "warning" | "info";

/** One `(channel, feedLabel, contentLanguage)` grouping in the scanned feed. */
export interface FeedLabelGroup {
  channel: string;
  feedLabel: string;
  contentLanguage: string;
  count: number;
  /** Whether a primary data source matches this group — set only when cross-checked. */
  matched?: boolean;
}

/** A problem found with the feed labels. */
export interface FeedLabelFinding {
  ruleId: string;
  severity: FeedLabelSeverity;
  feedLabel: string;
  message: string;
  suggestion?: string;
}

export interface FeedLabelCounts {
  error: number;
  warning: number;
  info: number;
}

export interface FeedLabelReport {
  /** Products scanned. */
  scanned: number;
  /** Whether the account's data sources were supplied (the `unmatched`/`orphaned` rules ran). */
  crossChecked: boolean;
  /** Feed-label distribution, sorted. */
  groups: FeedLabelGroup[];
  findings: FeedLabelFinding[];
  counts: FeedLabelCounts;
  strict: boolean;
  /** True when no error (and, under `strict`, no warning) was found. */
  ok: boolean;
}

export interface CheckFeedLabelsOptions {
  /** The account's primary data sources. Omit for offline-only analysis. */
  dataSources?: FeedLabelSource[];
  /** Count warnings as failures. */
  strict?: boolean;
}

// NUL-joined so a feedLabel containing the separator can't collide with another tuple.
function tupleKey(channel: string, feedLabel: string, contentLanguage: string): string {
  return `${channel}\u0000${feedLabel}\u0000${contentLanguage}`;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Analyze a feed's labels and (optionally) cross-check them against the account's
 * primary data sources. Pure: never throws, never does I/O. With no `dataSources`
 * the cross-check rules (`unmatched`, `orphaned-source`) are skipped.
 */
export function checkFeedLabels(
  products: FeedLabelProduct[],
  opts: CheckFeedLabelsOptions = {},
): FeedLabelReport {
  const crossChecked = opts.dataSources !== undefined;

  // Build the data-source match set (only sources that define a feedLabel can match).
  const sourceKeys = new Set<string>();
  const sources: FeedLabelSource[] = [];
  for (const s of opts.dataSources ?? []) {
    const feedLabel = s.feedLabel ?? "";
    if (!feedLabel) continue;
    const channel = s.channel ?? "";
    const contentLanguage = s.contentLanguage ?? "";
    sourceKeys.add(tupleKey(channel, feedLabel, contentLanguage));
    sources.push({ channel, feedLabel, contentLanguage });
  }

  // Group products by feed identity.
  const groupMap = new Map<string, FeedLabelGroup>();
  for (const p of products) {
    const channel = p.channel ?? "";
    const feedLabel = p.feedLabel ?? "";
    const contentLanguage = p.contentLanguage ?? "";
    const key = tupleKey(channel, feedLabel, contentLanguage);
    const g = groupMap.get(key);
    if (g) g.count += 1;
    else groupMap.set(key, { channel, feedLabel, contentLanguage, count: 1 });
  }
  const groups = [...groupMap.values()].sort(
    (a, b) =>
      cmp(a.feedLabel, b.feedLabel) ||
      cmp(a.contentLanguage, b.contentLanguage) ||
      cmp(a.channel, b.channel),
  );

  const findings: FeedLabelFinding[] = [];

  for (const g of groups) {
    // Missing feed label — can't be grouped into a feed at all.
    if (!g.feedLabel) {
      findings.push({
        ruleId: "feed-label.missing",
        severity: "error",
        feedLabel: "",
        message: `${g.count} product(s) have no feedLabel — they can't be grouped into a feed or served.`,
        suggestion: "Set feedLabel on every product (gmc migrate products derives it from targetCountry).",
      });
      continue;
    }
    // Cross-check against the account's data sources.
    if (crossChecked) {
      g.matched = sourceKeys.has(tupleKey(g.channel, g.feedLabel, g.contentLanguage));
      if (!g.matched) {
        const lang = g.contentLanguage ? ` (contentLanguage ${g.contentLanguage})` : "";
        findings.push({
          ruleId: "feed-label.unmatched",
          severity: "error",
          feedLabel: g.feedLabel,
          message: `No primary data source has feedLabel "${g.feedLabel}"${lang} — ${g.count} product(s) would land in a feed no campaign targets.`,
          suggestion: "Create a matching data source (gmc datasources create) or correct the feed label.",
        });
      }
    }
  }

  // Case variants: the same label written in different cases is two different feeds.
  const byLower = new Map<string, Set<string>>();
  for (const g of groups) {
    if (!g.feedLabel) continue;
    const set = byLower.get(g.feedLabel.toLowerCase()) ?? new Set<string>();
    set.add(g.feedLabel);
    byLower.set(g.feedLabel.toLowerCase(), set);
  }
  for (const variants of byLower.values()) {
    if (variants.size > 1) {
      const list = [...variants].sort(cmp);
      findings.push({
        ruleId: "feed-label.case-variant",
        severity: "warning",
        feedLabel: list[0] ?? "",
        message: `Feed label appears in multiple cases: ${list.map((v) => `"${v}"`).join(", ")} — Merchant Center treats these as different feeds.`,
        suggestion: "Use one consistent feed label (feed labels are case-sensitive).",
      });
    }
  }

  // Orphaned sources: a data source feed with no products to fill it (informational).
  if (crossChecked) {
    const productKeys = new Set(
      groups.filter((g) => g.feedLabel).map((g) => tupleKey(g.channel, g.feedLabel, g.contentLanguage)),
    );
    for (const s of sources) {
      const channel = s.channel ?? "";
      const contentLanguage = s.contentLanguage ?? "";
      const feedLabel = s.feedLabel ?? "";
      if (!productKeys.has(tupleKey(channel, feedLabel, contentLanguage))) {
        const lang = contentLanguage ? ` (${contentLanguage})` : "";
        findings.push({
          ruleId: "feed-label.orphaned-source",
          severity: "info",
          feedLabel,
          message: `Data source feedLabel "${feedLabel}"${lang} has no products in this feed.`,
        });
      }
    }
  }

  const rank: Record<FeedLabelSeverity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || cmp(a.ruleId, b.ruleId) || cmp(a.feedLabel, b.feedLabel),
  );

  const counts: FeedLabelCounts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  const strict = Boolean(opts.strict);
  const ok = counts.error === 0 && (!strict || counts.warning === 0);

  return { scanned: products.length, crossChecked, groups, findings, counts, strict, ok };
}
