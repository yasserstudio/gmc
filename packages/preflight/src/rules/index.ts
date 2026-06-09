// The rule registry — every rule the engine runs, in a stable order. Rules are
// grouped by family (required / format / policy) and ship across Phase 4:
//   v0.9.3 — seed required rules (offer id, title, price)
//   v0.9.4 — required-attribute + format library
//   v0.9.5 — policy / disapproval-trigger heuristics

import type { Rule } from "../types.js";
import { requiredRules } from "./required.js";

/** All rules, concatenated family by family. */
export const RULES: readonly Rule[] = [...requiredRules];
