import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDoctorCommand } from "./commands/doctor.js";

/**
 * Build the root `gmc` command tree.
 * Phase 1: global options, `auth`, `config`, and `doctor`.
 * Phase 2 adds `accounts` and `products`.
 */
export function createProgram(): Command {
  // `__GMC_VERSION` is injected at build time by tsup's `define` (see tsup.config.ts).
  const program = new Command();

  program
    .name("gmc")
    .description("Google Merchant Center CLI — typed, CI-friendly access to the Google Merchant API")
    .version(process.env["__GMC_VERSION"] || "0.0.0", "-V, --version")
    .option("-j, --json", "Output machine-readable JSON")
    .option("-p, --profile <name>", "Auth/account profile to use")
    .option("-a, --account <id>", "Merchant Center account id (overrides the profile)")
    .option("--no-color", "Disable colored output")
    .showSuggestionAfterError(false);

  registerAuthCommands(program);
  registerConfigCommands(program);
  registerDoctorCommand(program);

  return program;
}
