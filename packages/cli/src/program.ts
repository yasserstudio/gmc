import { Command } from "commander";
import { createContext } from "@gmc-cli/core";
import { getConfigDir } from "@gmc-cli/config";

/**
 * Build the root `gmc` command tree.
 * Phase 0 scaffold: global options plus a placeholder `doctor` command.
 * Phase 1 registers real `auth` and `doctor`; Phase 2 adds `accounts` and `products`.
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
    .option("--no-color", "Disable colored output")
    .showSuggestionAfterError(false);

  program
    .command("doctor")
    .description("Diagnose auth and GCP registration (Phase 1 — not yet implemented)")
    .action(() => {
      const opts = program.opts();
      const profile = typeof opts["profile"] === "string" ? opts["profile"] : undefined;
      const ctx = createContext({
        json: Boolean(opts["json"]),
        profile,
      });
      const payload = {
        ok: false,
        unimplemented: true,
        message: "gmc doctor is not implemented yet — Phase 1",
        configDir: getConfigDir(),
        profile: ctx.profile ?? null,
      };
      if (ctx.json) {
        process.stdout.write(`${JSON.stringify(payload)}\n`);
      } else {
        process.stderr.write(
          `gmc doctor: not implemented yet (Phase 1) — config dir ${payload.configDir}\n`,
        );
      }
      process.exitCode = 1;
    });

  return program;
}
