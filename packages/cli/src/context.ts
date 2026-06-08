import type { Command } from "commander";
import { createContext, type CommandContext } from "@gmc-cli/core";
import { loadConfig, resolveProfile } from "@gmc-cli/config";

interface GlobalOpts {
  json?: unknown;
  profile?: unknown;
  account?: unknown;
  color?: unknown;
}

/**
 * Read just the `--json` flag without touching config. Safe to call before
 * (and inside the catch of) context resolution so error output respects the
 * requested format even when config loading itself fails.
 */
export function wantsJson(program: Command): boolean {
  return Boolean((program.opts() as GlobalOpts).json);
}

/**
 * Build the {@link CommandContext} for an invocation: merge global flags with
 * the loaded config and resolve the effective profile/account. Throws
 * ConfigError if the config file is present but malformed.
 */
export function contextFrom(program: Command): CommandContext {
  const opts = program.opts() as GlobalOpts;
  const config = loadConfig();
  const resolved = resolveProfile(config, {
    profile: typeof opts.profile === "string" ? opts.profile : undefined,
    accountId: typeof opts.account === "string" ? opts.account : undefined,
  });
  return createContext({
    json: Boolean(opts.json),
    // Commander sets `color: false` for --no-color; default is allowed.
    color: opts.color !== false,
    profile: resolved.name,
    accountId: resolved.accountId,
  });
}
