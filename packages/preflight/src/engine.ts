// The preflight engine: map every enabled rule over every product and collect
// findings. Pure — no I/O, no network, no auth. The CLI sources products (local
// files or `--remote` pull) and renders the report; this just runs the rules.

import type { ProductInput } from "@gmc-cli/api";
import type {
  Finding,
  FindingCounts,
  PreflightConfig,
  PreflightReport,
  Rule,
  RuleContext,
  Severity,
} from "./types.js";
import { RULES } from "./rules/index.js";

/**
 * Exit code for a preflight run that produced gating findings. Mirrors
 * `ExitCode.Preflight` in @gmc-cli/core (hardcoded — preflight doesn't depend on
 * core); CI branches on it to fail a build on a real violation.
 */
export const PREFLIGHT_EXIT_CODE = 6;

/**
 * Composite product identity — the same `{channel}~{contentLanguage}~{feedLabel}~{offerId}`
 * key Merchant Center (and `gmc feeds`) use. Missing parts collapse to empty segments.
 */
export function productKey(input: ProductInput): string {
  return [input.channel, input.contentLanguage, input.feedLabel, input.offerId]
    .map((part) => part ?? "")
    .join("~");
}

/** Resolve a rule's effective level: an explicit override, else its default. */
function settingFor(rule: Rule, config: PreflightConfig): Severity | "off" {
  const override = config.rules?.[rule.id];
  return override ?? rule.defaultSeverity;
}

/** Stable finding order: by product, then rule id. Shared so every caller sorts identically. */
export function findingComparator(a: Finding, b: Finding): number {
  return a.productKey.localeCompare(b.productKey) || a.ruleId.localeCompare(b.ruleId);
}

/**
 * The single source of truth for the pass/fail gate: a run fails on any error, and
 * (under strict) on any warning too. Shared by {@link runPreflight} and the CLI's
 * parse-failure folding so the exit-code contract can never diverge between them.
 */
export function gate(counts: FindingCounts, strict: boolean): { ok: boolean; exitCode: number } {
  const ok = counts.error === 0 && (!strict || counts.warning === 0);
  return { ok, exitCode: ok ? 0 : PREFLIGHT_EXIT_CODE };
}

/**
 * Run every enabled rule over every product.
 *
 * - `config.rules` overrides a rule's severity, or disables it with `"off"`.
 * - `config.ignore` skips a product entirely by offer id (not scanned, not counted).
 * - `config.strict` counts warnings as failures for `ok`/`exitCode` (findings keep
 *   their own severity; only the gate changes).
 *
 * `rules` is injectable for testing; defaults to the full registry.
 */
export function runPreflight(
  products: readonly ProductInput[],
  config: PreflightConfig = {},
  rules: readonly Rule[] = RULES,
): PreflightReport {
  const ignore = new Set(config.ignore ?? []);
  const strict = config.strict ?? false;
  const ctx: RuleContext = config.targetCountry ? { targetCountry: config.targetCountry } : {};

  // Resolve each rule's level once — it doesn't vary per product.
  const active = rules
    .map((rule) => ({ rule, setting: settingFor(rule, config) }))
    .filter((r): r is { rule: Rule; setting: Severity } => r.setting !== "off");

  const findings: Finding[] = [];
  let scanned = 0;
  for (const product of products) {
    if (product.offerId !== undefined && ignore.has(product.offerId)) continue;
    scanned += 1;
    const key = productKey(product);
    const offerId = product.offerId ?? null;
    for (const { rule, setting } of active) {
      // A rule that throws (e.g. on a runtime value that violates the static type,
      // like a numeric `amountMicros` from a hand-edited file) becomes an error
      // finding rather than crashing the whole scan — one bad product can't sink
      // the run, which matters as the rule set grows.
      let violations: ReturnType<Rule["check"]>;
      try {
        violations = rule.check(product, ctx);
      } catch (err) {
        violations = [
          { message: `Rule failed: ${err instanceof Error ? err.message : String(err)}` },
        ];
      }
      for (const violation of violations) {
        findings.push({
          ...violation,
          ruleId: rule.id,
          severity: setting,
          productKey: key,
          offerId,
        });
      }
    }
  }

  findings.sort(findingComparator);

  const counts: FindingCounts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return { ...gate(counts, strict), scanned, strict, counts, findings };
}
