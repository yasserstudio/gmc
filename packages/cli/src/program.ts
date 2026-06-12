import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerAccountsCommands } from "./commands/accounts.js";
import { registerProductsCommands } from "./commands/products.js";
import { registerDataSourcesCommands } from "./commands/datasources.js";
import { registerFeedsCommands } from "./commands/feeds.js";
import { registerPreflightCommand } from "./commands/preflight.js";
import { registerMigrateCommands } from "./commands/migrate.js";
import { registerInventoryCommands } from "./commands/inventory.js";
import { registerPromotionsCommands } from "./commands/promotions.js";
import { registerRegionsCommands } from "./commands/regions.js";
import { registerNotificationsCommands } from "./commands/notifications.js";
import { registerReportsCommands } from "./commands/reports.js";

/**
 * Build the root `gmc` command tree.
 * Phase 1: global options, `auth`, `config`, and `doctor`.
 * Phase 2: `accounts` (v0.6) and `products` (v0.7) — the spike's MVP surface.
 * Phase 3: `datasources` (v0.8) and `feeds` (v0.9) — feeds as code.
 * Phase 4: `preflight` (v0.9.3) — offline feed-compliance scanner.
 * Phase 5: `migrate` (v0.9.6) — Content API → Merchant API assistant.
 * Phase 6: `inventory` (v0.9.9) + `promotions` (v0.9.10).
 * Phase 7: `reports` (v0.9.11) — MCQL queries + performance.
 */
export function createProgram(): Command {
  // `__GMC_VERSION` is injected at build time by tsup's `define` (see tsup.config.ts).
  const program = new Command();

  program
    .name("gmc")
    .description(
      "Google Merchant Center CLI — typed, CI-friendly access to the Google Merchant API",
    )
    .version(process.env["__GMC_VERSION"] || "0.0.0", "-V, --version")
    .option("-j, --json", "Output machine-readable JSON")
    .option("-p, --profile <name>", "Auth/account profile to use")
    .option("-a, --account <id>", "Merchant Center account id (overrides the profile)")
    .option("--no-color", "Disable colored output")
    .showSuggestionAfterError(false);

  registerAuthCommands(program);
  registerConfigCommands(program);
  registerDoctorCommand(program);
  registerAccountsCommands(program);
  registerProductsCommands(program);
  registerDataSourcesCommands(program);
  registerFeedsCommands(program);
  registerPreflightCommand(program);
  registerMigrateCommands(program);
  registerInventoryCommands(program);
  registerPromotionsCommands(program);
  registerRegionsCommands(program);
  registerNotificationsCommands(program);
  registerReportsCommands(program);

  return program;
}
