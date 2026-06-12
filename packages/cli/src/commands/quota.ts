import type { Command } from "commander";
import { emitJson, reportError } from "@gmc-cli/core";
import { QuotaService, type QuotaGroup } from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount } from "./_shared.js";

/** The bare group id (last segment of the resource name). */
function quotaGroupOf(group: QuotaGroup): string {
  return group.name ? (group.name.split("/").pop() ?? group.name) : "—";
}

function renderQuotas(groups: QuotaGroup[]): void {
  if (groups.length === 0) {
    process.stdout.write("No quota groups for this account.\n");
    return;
  }
  const rows = groups.map((g) => ({
    id: quotaGroupOf(g),
    daily: `${g.quotaUsage ?? "—"}/${g.quotaLimit ?? "—"}`,
    minute: g.quotaMinuteLimit ?? "—",
  }));
  const idWidth = Math.max(...rows.map((r) => r.id.length));
  const dailyWidth = Math.max(...rows.map((r) => r.daily.length));
  process.stdout.write(`${groups.length} quota group(s):\n`);
  for (const r of rows) {
    process.stdout.write(
      `  ${r.id.padEnd(idWidth)}  ${r.daily.padEnd(dailyWidth)} daily · ${r.minute}/min\n`,
    );
  }
}

/** Register the `gmc quota` command group (read-only `list`). */
export function registerQuotaCommands(program: Command): void {
  const quota = program
    .command("quota")
    .description("Inspect daily Merchant API call quota and usage");

  quota
    .command("list")
    .description("List quota groups with daily usage/limit and the per-minute limit")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new QuotaService(await clientFor(ctx, account));
        const groups = await service.listQuotas();
        if (ctx.json) emitJson({ quotas: groups });
        else renderQuotas(groups);
      } catch (err) {
        reportError(err, { json }, "gmc quota list");
      }
    });
}
