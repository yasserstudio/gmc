import { Command } from "commander";
import { ExitCode, emitJson, reportError } from "@gmc-cli/core";
import { getConfigDir } from "@gmc-cli/config";
import { registerAuthCommands } from "./commands/auth.js";
import { registerConfigCommands } from "./commands/config.js";
import { contextFrom, wantsJson } from "./context.js";

/**
 * Build the root `gmc` command tree.
 * Phase 1: global options, `auth`, `config`, and a placeholder `doctor`.
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

  program
    .command("doctor")
    .description("Diagnose auth and GCP registration (Phase 1 — not yet implemented)")
    .action(() => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const payload = {
          ok: false,
          unimplemented: true,
          message: "gmc doctor is not implemented yet — Phase 1",
          configDir: getConfigDir(),
          profile: ctx.profile,
        };
        if (ctx.json) {
          emitJson(payload);
        } else {
          process.stderr.write(
            `gmc doctor: not implemented yet (Phase 1) — config dir ${payload.configDir}\n`,
          );
        }
        process.exitCode = ExitCode.Error;
      } catch (err) {
        // Surface a config error (exit 4) rather than crashing the placeholder.
        reportError(err, { json }, "gmc doctor");
      }
    });

  return program;
}
