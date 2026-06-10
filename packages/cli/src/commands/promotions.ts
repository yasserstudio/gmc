import type { Command } from "commander";
import { emitJson, reportError } from "@gmc-cli/core";
import { PromotionsService, promotionSegment, type Promotion } from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import {
  clientFor,
  resolveAccount,
  readJsonObject,
  line,
  parsePageSize,
  requireDataSource,
} from "./_shared.js";

function promotionIdOf(p: Promotion): string {
  return p.promotionId ?? (p.name ? promotionSegment(p.name) : "—");
}

function renderPromotions(promotions: Promotion[]): void {
  if (promotions.length === 0) {
    process.stdout.write("No promotions.\n");
    return;
  }
  const rows = promotions.map((p) => ({
    id: promotionIdOf(p),
    title: p.attributes?.longTitle ?? "—",
    type: p.attributes?.couponValueType ?? p.attributes?.offerType ?? "—",
  }));
  const idWidth = Math.max(...rows.map((r) => r.id.length));
  process.stdout.write(`${promotions.length} promotion(s):\n`);
  for (const r of rows) {
    process.stdout.write(`  ${r.id.padEnd(idWidth)}  ${r.title}  [${r.type}]\n`);
  }
}

function renderPromotion(p: Promotion): void {
  line("Promotion ID", promotionIdOf(p));
  if (p.attributes?.longTitle) line("Title", p.attributes.longTitle);
  if (p.contentLanguage) line("Language", p.contentLanguage);
  if (p.targetCountry) line("Country", p.targetCountry);
  if (p.attributes?.couponValueType) line("Value type", p.attributes.couponValueType);
  if (p.attributes?.offerType) line("Offer type", p.attributes.offerType);
  const window = p.attributes?.promotionEffectiveTimePeriod;
  if (window?.startTime || window?.endTime) {
    line("Effective", `${window.startTime ?? "…"} → ${window.endTime ?? "…"}`);
  }
  if (p.redemptionChannel?.length) line("Channels", p.redemptionChannel.join(", "));
}

/** Register the `gmc promotions` command group (list / get / insert). */
export function registerPromotionsCommands(program: Command): void {
  const promotions = program.command("promotions").description("Manage Merchant Center promotions");

  promotions
    .command("list")
    .option("--page-size <n>", "Max promotions per API page")
    .description("List promotions for the account")
    .action(async (opts: { pageSize?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const service = new PromotionsService(await clientFor(ctx, account));
        const list = await service.listPromotions(pageSize ? { pageSize } : {});
        if (ctx.json) emitJson({ promotions: list });
        else renderPromotions(list);
      } catch (err) {
        reportError(err, { json }, "gmc promotions list");
      }
    });

  promotions
    .command("get")
    .argument("<promotionId>", "Promotion id or resource name (from `promotions list`)")
    .description("Fetch one promotion")
    .action(async (promotionId: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new PromotionsService(await clientFor(ctx, account));
        const result = await service.getPromotion(promotionId);
        if (ctx.json) emitJson(result);
        else renderPromotion(result);
      } catch (err) {
        reportError(err, { json }, "gmc promotions get");
      }
    });

  promotions
    .command("insert")
    .option("--data-source <id>", "Promotion data source id or resource name to insert under")
    .option("--file <path>", "Read the Promotion JSON from this file (else stdin)")
    .description("Insert a promotion (create or replace) from JSON")
    .action(async (opts: { dataSource?: string; file?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const dataSource = requireDataSource(opts.dataSource, "insert a promotion");
        const input = (await readJsonObject(opts.file, "promotion")) as Promotion;
        const service = new PromotionsService(await clientFor(ctx, account));
        const result = await service.insertPromotion(input, dataSource);
        if (ctx.json) emitJson(result);
        else {
          const id = result.promotionId ?? input.promotionId ?? "promotion";
          process.stdout.write(`Inserted promotion ${id}.\n`);
          process.stdout.write(
            "Processing is async; it may take a few minutes to appear in `promotions get`.\n",
          );
        }
      } catch (err) {
        reportError(err, { json }, "gmc promotions insert");
      }
    });
}
