// @gmc-cli/preflight — the offline feed-compliance engine behind `gmc preflight`.
// A pure rule engine: it takes product inputs and a config, returns a report of
// findings. No network, no auth, no filesystem (except reading `.gmcpreflightrc`).
// The CLI sources products (local files or `--remote` pull) and renders the report.

export { runPreflight, gate, findingComparator, PREFLIGHT_EXIT_CODE } from "./engine.js";
// productKey now lives with the ProductInput type in @gmc-cli/api; re-exported here
// so existing `@gmc-cli/preflight` consumers keep importing it from one place.
export { productKey } from "@gmc-cli/api";
export { loadPreflightConfig, findPreflightConfig, PREFLIGHT_RC } from "./config.js";
export type { LoadedPreflightConfig } from "./config.js";
export { PreflightConfigError } from "./errors.js";
export { RULES } from "./rules/index.js";
export type {
  Severity,
  RuleSetting,
  RuleViolation,
  Finding,
  FindingCounts,
  Rule,
  RuleContext,
  PreflightConfig,
  PreflightReport,
} from "./types.js";
