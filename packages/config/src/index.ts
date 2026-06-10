// @gmc-cli/config — configuration loading, profiles, and environment support.
//
// Config lives at ${GMC_CONFIG_DIR:-~/.config/gmc}/config.json. A profile selects
// a Merchant Center account (and, via @gmc-cli/auth, a stored credential). The
// effective profile is resolved from, in order: an explicit CLI value, the
// GMC_PROFILE env var, the file's defaultProfile, then "default". Account id
// resolves similarly with GMC_ACCOUNT_ID and the profile's file entry.

import { readFileSync } from "node:fs";
import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ConfigError } from "./errors.js";

export { ConfigError } from "./errors.js";

/** Per-profile settings. */
export interface ProfileConfig {
  /** Merchant Center account id (numeric string). */
  accountId?: string;
}

/** On-disk configuration shape. */
export interface GmcConfig {
  /** Profile used when none is selected on the CLI or via GMC_PROFILE. */
  defaultProfile?: string;
  /** Named profiles, each targeting a merchant account. */
  profiles?: Record<string, ProfileConfig>;
}

/** The profile resolved for a single command invocation. */
export interface ResolvedProfile {
  /** Selected profile name — always set ("default" when unspecified). */
  name: string;
  /** Resolved Merchant Center account id, if configured. */
  accountId?: string;
}

/** Profile used when nothing selects one. */
export const DEFAULT_PROFILE = "default";

// Profile names that would corrupt the object-as-map used to store/look up
// profiles (prototype mutation on assignment, false hits on lookup). Rejected
// rather than sanitized so the failure is explicit.
const RESERVED_PROFILE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Directory where gmc stores config and credentials. */
export function getConfigDir(): string {
  return process.env["GMC_CONFIG_DIR"] ?? join(homedir(), ".config", "gmc");
}

/** Path to the user config file. */
export function getUserConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

function validateConfig(data: unknown, source: string): GmcConfig {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError(
      `Config must be a JSON object: ${source}`,
      "CONFIG_INVALID",
      'The config file must contain a JSON object, e.g. { "defaultProfile": "prod", "profiles": {} }.',
    );
  }

  const record = data as Record<string, unknown>;
  const config: GmcConfig = {};

  const defaultProfile = record["defaultProfile"];
  if (defaultProfile !== undefined) {
    if (typeof defaultProfile !== "string" || defaultProfile === "") {
      throw new ConfigError(
        `"defaultProfile" must be a non-empty string: ${source}`,
        "CONFIG_INVALID",
        'Set "defaultProfile" to the name of one of your profiles.',
      );
    }
    config.defaultProfile = defaultProfile;
  }

  const profiles = record["profiles"];
  if (profiles !== undefined) {
    if (typeof profiles !== "object" || profiles === null || Array.isArray(profiles)) {
      throw new ConfigError(
        `"profiles" must be an object keyed by profile name: ${source}`,
        "CONFIG_INVALID",
        'Use { "profiles": { "prod": { "accountId": "123" } } }.',
      );
    }
    const out: Record<string, ProfileConfig> = {};
    for (const [name, value] of Object.entries(profiles)) {
      if (RESERVED_PROFILE_KEYS.has(name)) {
        throw new ConfigError(
          `Profile name "${name}" is reserved: ${source}`,
          "CONFIG_INVALID",
          "Rename the profile to anything other than __proto__, constructor, or prototype.",
        );
      }
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new ConfigError(
          `Profile "${name}" must be an object: ${source}`,
          "CONFIG_INVALID",
          `Give "${name}" an object value, e.g. { "accountId": "123" }.`,
        );
      }
      const entry = value as Record<string, unknown>;
      const profile: ProfileConfig = {};
      const accountId = entry["accountId"];
      if (accountId !== undefined) {
        if (typeof accountId !== "string" || !/^\d+$/.test(accountId)) {
          throw new ConfigError(
            `Profile "${name}" accountId must be a numeric string: ${source}`,
            "CONFIG_INVALID",
            'Account ids are numeric, e.g. "123456789".',
          );
        }
        profile.accountId = accountId;
      }
      out[name] = profile;
    }
    config.profiles = out;
  }

  return config;
}

/**
 * Load and validate the configuration. A missing file yields an empty config;
 * a present-but-malformed file throws {@link ConfigError}.
 */
export function loadConfig(configPath: string = getUserConfigPath()): GmcConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return {};
    }
    throw new ConfigError(
      `Failed to read config file: ${configPath}`,
      "CONFIG_READ_FAILED",
      "Ensure the file is readable, or delete it to start fresh.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(
      `Config file is not valid JSON: ${configPath}`,
      "CONFIG_INVALID",
      "Fix the JSON syntax, or delete the file to start fresh.",
    );
  }

  return validateConfig(parsed, configPath);
}

/**
 * Resolve the effective profile and account id for an invocation, merging an
 * explicit CLI selection, environment variables, and the file config.
 */
export function resolveProfile(
  config: GmcConfig,
  opts: { profile?: string; accountId?: string } = {},
): ResolvedProfile {
  const name =
    opts.profile ?? process.env["GMC_PROFILE"] ?? config.defaultProfile ?? DEFAULT_PROFILE;
  if (RESERVED_PROFILE_KEYS.has(name)) {
    throw new ConfigError(
      `Profile name "${name}" is reserved.`,
      "CONFIG_INVALID",
      "Select a profile other than __proto__, constructor, or prototype.",
    );
  }
  // Own-property check so inherited keys (e.g. a profile literally named
  // "toString") never produce a false hit on the profiles object.
  const fromFile =
    config.profiles && Object.hasOwn(config.profiles, name) ? config.profiles[name] : undefined;
  const accountId = opts.accountId ?? process.env["GMC_ACCOUNT_ID"] ?? fromFile?.accountId;

  const resolved: ResolvedProfile = { name };
  if (accountId !== undefined) resolved.accountId = accountId;
  return resolved;
}

/** Options for {@link upsertProfile}. */
export interface UpsertProfileOptions {
  /** Also set this profile as the `defaultProfile`. */
  setDefault?: boolean;
  /** Config file path (defaults to the user config path). */
  configPath?: string;
}

/**
 * Atomically persist the configuration. The shape is re-validated first (so a bad
 * in-memory config never lands on disk), then written via a randomized temp file
 * + `rename` so readers never observe a partial file. Mirrors `writeJsonFileSecure`
 * in @gmc-cli/auth: config.json isn't secret, but 0600/0700 keeps it consistent
 * with the credential store living in the same directory.
 */
export async function saveConfig(
  config: GmcConfig,
  configPath: string = getUserConfigPath(),
): Promise<void> {
  const validated = validateConfig(config, configPath);
  const parent = dirname(configPath);
  // mkdir returns the first directory created, or undefined if it already existed —
  // only tighten permissions on a directory we just created.
  const created = await mkdir(parent, { recursive: true });
  if (created) await chmod(parent, 0o700).catch(() => {});

  const tmpPath = `${configPath}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(validated, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    await chmod(tmpPath, 0o600).catch(() => {});
    await rename(tmpPath, configPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/**
 * Create or update a single profile and persist the config, preserving every
 * other profile and the existing `defaultProfile` (unless `setDefault` is given).
 * Returns the saved config. Throws {@link ConfigError} for a reserved profile name
 * or an invalid value (e.g. a non-numeric account id), via {@link saveConfig}'s
 * validation.
 */
export async function upsertProfile(
  name: string,
  profile: ProfileConfig,
  opts: UpsertProfileOptions = {},
): Promise<GmcConfig> {
  if (RESERVED_PROFILE_KEYS.has(name)) {
    throw new ConfigError(
      `Profile name "${name}" is reserved.`,
      "CONFIG_INVALID",
      "Choose a name other than __proto__, constructor, or prototype.",
    );
  }
  const configPath = opts.configPath ?? getUserConfigPath();
  const config = loadConfig(configPath);
  const profiles: Record<string, ProfileConfig> = { ...(config.profiles ?? {}) };
  profiles[name] = { ...profile };
  const next: GmcConfig = { ...config, profiles };
  if (opts.setDefault) next.defaultProfile = name;
  await saveConfig(next, configPath);
  return next;
}
