import type { Command } from "commander";
import { emitJson, reportError } from "@gmc-cli/core";
import {
  QuotaService,
  accountLimitSegment,
  type AccountLimit,
  type QuotaGroup,
} from "@gmc-cli/api";
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

function renderLimits(limits: AccountLimit[]): void {
  if (limits.length === 0) {
    process.stdout.write("No matching account limits.\n");
    return;
  }
  const rows = limits.map((limit) => ({
    id: limit.name ? accountLimitSegment(limit.name) : "—",
    scope: limit.products?.scope ?? "—",
    limit: limit.products?.limit ?? "—",
  }));
  const idWidth = Math.max(...rows.map((row) => row.id.length));
  process.stdout.write(`${limits.length} account limit(s):\n`);
  for (const row of rows) {
    process.stdout.write(`  ${row.id.padEnd(idWidth)}  ${row.limit} products · ${row.scope}\n`);
  }
}

/** Register the read-only `gmc quota` command group (usage and account limits). */
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

  const limits = quota.command("limits").description("Inspect account resource limits");

  limits
    .command("list")
    .option("--filter <expression>", 'Limit filter (default: type = "products")')
    .description("List product-count limits for the account")
    .action(async (opts: { filter?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new QuotaService(await clientFor(ctx, account));
        const list = await service.listLimits(opts.filter);
        if (ctx.json) emitJson({ limits: list });
        else renderLimits(list);
      } catch (err) {
        reportError(err, { json }, "gmc quota limits list");
      }
    });

  limits
    .command("get")
    .argument("<limit>", "Limit id, e.g. products~ADS_EEA")
    .description("Fetch one account limit")
    .action(async (limit: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new QuotaService(await clientFor(ctx, account));
        const result = await service.getLimit(limit);
        if (ctx.json) emitJson(result);
        else renderLimits([result]);
      } catch (err) {
        reportError(err, { json }, "gmc quota limits get");
      }
    });
}
