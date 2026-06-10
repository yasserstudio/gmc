// Shared types for @gmc-cli/preflight — the offline feed-compliance engine.
// Kept out of the barrel so engine.ts, config.ts, and the rule modules can import
// them without a cycle through index.

import type { ProductInput } from "@gmc-cli/api";

/**
 * How serious a finding is. (Distinct from `gmc doctor`'s pass/warn/fail: preflight
 * only ever emits problems, so there is no "pass", and it has an "info" level.)
 */
export type Severity = "error" | "warning" | "info";

/** A rule's configured level: a severity, or `"off"` to disable it. */
export type RuleSetting = Severity | "off";

/**
 * One problem a rule found with a product, before the engine attaches the
 * product identity and effective severity. Shaped to echo the Merchant API's
 * `ItemLevelIssue` (attribute / description / documentation) so preflight reads
 * like a prediction of what the API would report.
 */
export interface RuleViolation {
  /** The product attribute at fault (e.g. "title", "price.currencyCode"), if any. */
  attribute?: string;
  /** Human-readable description of the problem. */
  message: string;
  /** How to fix it. */
  suggestion?: string;
  /** Link to the relevant Merchant Center documentation. */
  documentation?: string;
}

/** A {@link RuleViolation} resolved against one product, ready to report. */
export interface Finding extends RuleViolation {
  /** The rule that produced it (e.g. "required.title"). */
  ruleId: string;
  /** Effective severity (config override, else the rule's default). */
  severity: Severity;
  /** Composite product identity `{contentLanguage}~{feedLabel}~{offerId}` (`local~`-prefixed for legacy-local). */
  productKey: string;
  /** The product's offer id, or null when it has none. */
  offerId: string | null;
}

/** Read-only context passed to every rule (locale-aware checks land in a later phase). */
export interface RuleContext {
  /** Target country (ISO-3166 alpha-2), from config — for locale-aware rules. */
  targetCountry?: string;
}

/** A single compliance rule: a pure function over one product. */
export interface Rule {
  /** Stable dotted id, e.g. "required.title" / "format.link-url" / "policy.promotional-title". */
  id: string;
  /** Short human title. */
  title: string;
  /** Severity used when config doesn't override the rule. */
  defaultSeverity: Severity;
  /** Inspect one product; return zero or more violations. Must be pure. */
  check(product: ProductInput, ctx: RuleContext): RuleViolation[];
}

/** On-disk `.gmcpreflightrc` shape (all fields optional). */
export interface PreflightConfig {
  /** Per-rule level overrides, keyed by rule id. */
  rules?: Record<string, RuleSetting>;
  /** Offer ids to skip entirely (e.g. known-legacy products). */
  ignore?: string[];
  /** Target country (ISO-3166 alpha-2) for locale-aware rules. */
  targetCountry?: string;
  /** Treat warnings as failures for the exit code (like `--strict`). */
  strict?: boolean;
}

/** Tally of findings by severity. */
export interface FindingCounts {
  error: number;
  warning: number;
  info: number;
}

/** The result of a preflight run. Carries its own exit code, like DoctorReport. */
export interface PreflightReport {
  /** True when nothing gates the run: no errors (and no warnings under strict). */
  ok: boolean;
  /** Process exit code: 0 when ok, else `PREFLIGHT_EXIT_CODE` (6). */
  exitCode: number;
  /** Number of products checked (excludes ignored offer ids). */
  scanned: number;
  /** Whether warnings were counted as failures for `ok`/`exitCode`. */
  strict: boolean;
  /** Findings by severity. */
  counts: FindingCounts;
  /** Every finding, sorted by product then rule id. */
  findings: Finding[];
}
