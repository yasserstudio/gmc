// @gmc-cli/config — configuration loading, profiles, and environment support.
// Phase 0 scaffold. Phase 1 forks the real loader from @gpc-cli/config
// (file + env merge, multiple merchant-account profiles, validation).

import { homedir } from "node:os";
import { join } from "node:path";

export interface GmcConfig {
  /** Name of the profile to use when none is passed on the CLI. */
  defaultProfile?: string;
  /** Merchant Center account id (numeric), per profile in Phase 1. */
  accountId?: string;
}

/** Directory where gmc stores config and credentials. */
export function getConfigDir(): string {
  return process.env["GMC_CONFIG_DIR"] ?? join(homedir(), ".config", "gmc");
}

/** Path to the user config file. */
export function getUserConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

/**
 * Load the merged configuration.
 * Phase 0 scaffold returns empty defaults; Phase 1 reads file + env + profiles.
 */
export function loadConfig(): GmcConfig {
  return {};
}
