// @gmc-cli/preflight — the offline feed-compliance engine behind `gmc preflight`.
// A pure rule engine: it takes product inputs and a config, returns a report of
// findings. No network, no auth, no filesystem (except reading `.gmcpreflightrc`).
// The CLI sources products (local files or `--remote` pull) and renders the report.

export {
  runPreflight,
  productKey,
  gate,
  findingComparator,
  PREFLIGHT_EXIT_CODE,
} from "./engine.js";
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
