// `.gmcpreflightrc` loading and validation. The file is project-local (committed
// alongside the feeds/ directory it gates), discovered by walking up from a start
// directory — distinct from the user config in ~/.config/gmc, which is per-machine.
// Validation mirrors the rigor of @gmc-cli/config: typed, explicit, fail-loud.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse as parsePath, resolve } from "node:path";
import { PreflightConfigError } from "./errors.js";
import type { PreflightConfig, RuleSetting } from "./types.js";

/** Conventional config filename. */
export const PREFLIGHT_RC = ".gmcpreflightrc";

const RULE_SETTINGS: ReadonlySet<string> = new Set<RuleSetting>([
  "error",
  "warning",
  "info",
  "off",
]);

// Rule-map keys that would corrupt the object-as-map (prototype pollution on
// assignment / false hits on lookup). Rejected rather than sanitized, like the
// reserved profile names in @gmc-cli/config.
const RESERVED_RULE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** A loaded config plus the path it came from (undefined when none was found). */
export interface LoadedPreflightConfig {
  config: PreflightConfig;
  /** Absolute path of the `.gmcpreflightrc` used, or undefined if defaults. */
  path?: string;
}

function invalid(message: string, suggestion: string, source: string): never {
  throw new PreflightConfigError(`${message}: ${source}`, "PREFLIGHT_CONFIG_INVALID", suggestion);
}

function validate(data: unknown, source: string): PreflightConfig {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    invalid(
      "Preflight config must be a JSON object",
      'Use an object, e.g. { "rules": { "policy.promotional-title": "off" }, "strict": false }.',
      source,
    );
  }
  const record = data as Record<string, unknown>;
  const config: PreflightConfig = {};

  const rules = record["rules"];
  if (rules !== undefined) {
    if (typeof rules !== "object" || rules === null || Array.isArray(rules)) {
      invalid(
        '"rules" must be an object keyed by rule id',
        'Use { "rules": { "required.title": "warning" } }.',
        source,
      );
    }
    // Null-prototype map: defense-in-depth against prototype pollution, and so a
    // rule id that happens to collide with an Object.prototype member (e.g.
    // "toString") can never produce a false hit on lookup in the engine.
    const out: Record<string, RuleSetting> = Object.create(null);
    for (const [id, value] of Object.entries(rules as Record<string, unknown>)) {
      if (RESERVED_RULE_KEYS.has(id)) {
        invalid(
          `Rule id "${id}" is reserved`,
          "Rename it to anything other than __proto__, constructor, or prototype.",
          source,
        );
      }
      if (typeof value !== "string" || !RULE_SETTINGS.has(value)) {
        invalid(
          `Rule "${id}" must be "error", "warning", "info", or "off"`,
          `Set "${id}" to one of: error, warning, info, off.`,
          source,
        );
      }
      out[id] = value as RuleSetting;
    }
    config.rules = out;
  }

  const ignore = record["ignore"];
  if (ignore !== undefined) {
    if (!Array.isArray(ignore) || ignore.some((v) => typeof v !== "string")) {
      invalid(
        '"ignore" must be an array of offer-id strings',
        'Use { "ignore": ["sku-1", "sku-2"] }.',
        source,
      );
    }
    config.ignore = ignore as string[];
  }

  const targetCountry = record["targetCountry"];
  if (targetCountry !== undefined) {
    if (typeof targetCountry !== "string" || targetCountry === "") {
      invalid(
        '"targetCountry" must be a non-empty string',
        'Use an ISO-3166 alpha-2 code, e.g. "US".',
        source,
      );
    }
    config.targetCountry = targetCountry;
  }

  const strict = record["strict"];
  if (strict !== undefined) {
    if (typeof strict !== "boolean") {
      invalid(
        '"strict" must be a boolean',
        'Use { "strict": true } to treat warnings as failures.',
        source,
      );
    }
    config.strict = strict;
  }

  return config;
}

function parseFile(path: string): PreflightConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    throw new PreflightConfigError(
      `Failed to read preflight config: ${path}`,
      "PREFLIGHT_CONFIG_READ_FAILED",
      "Ensure the file is readable, or delete it to start fresh.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PreflightConfigError(
      `Preflight config is not valid JSON: ${path}`,
      "PREFLIGHT_CONFIG_INVALID",
      "Fix the JSON syntax, or delete the file to start fresh.",
    );
  }
  return validate(parsed, path);
}

/**
 * Walk up from `startDir` to the filesystem root, returning the path of the first
 * `.gmcpreflightrc` found — so a command run in a subdirectory still picks up the
 * project's config (like ESLint/Prettier rc discovery).
 */
export function findPreflightConfig(startDir: string): string | undefined {
  let dir = resolve(startDir);
  const root = parsePath(dir).root;
  // Bounded by the filesystem root; `dir === root` is the stop condition. Probe with
  // existsSync (one stat, no allocation) rather than reading each candidate's bytes.
  for (;;) {
    const candidate = join(dir, PREFLIGHT_RC);
    if (existsSync(candidate)) return candidate;
    if (dir === root) return undefined;
    dir = dirname(dir);
  }
}

/**
 * Load `.gmcpreflightrc`. With an explicit `configPath`, the file must exist and
 * parse (else throws). Otherwise it's discovered by walking up from `cwd`; if none
 * is found, an empty config is returned and preflight runs with every rule's
 * default severity.
 */
export function loadPreflightConfig(
  opts: { cwd?: string; configPath?: string } = {},
): LoadedPreflightConfig {
  if (opts.configPath !== undefined) {
    const path = resolve(opts.configPath);
    return { config: parseFile(path), path };
  }
  const found = findPreflightConfig(opts.cwd ?? process.cwd());
  if (found === undefined) return { config: {} };
  return { config: parseFile(found), path: found };
}
