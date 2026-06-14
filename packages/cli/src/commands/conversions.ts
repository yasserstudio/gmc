import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  ConversionsService,
  conversionSourceSegment,
  type ConversionSource,
  type ConversionSourceInput,
  type MerchantCenterDestination,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, line, readJsonObject, pick } from "./_shared.js";

const CONVERSION_SOURCE_FIELDS = [
  "merchantCenterDestination",
  "googleAnalyticsLink",
] as const satisfies readonly (keyof ConversionSourceInput)[];

interface ConversionWriteOpts {
  gaProperty?: string;
  merchantCenter?: boolean;
  currency?: string;
  displayName?: string;
  file?: string;
  updateMask?: string;
}

/** True when any of the convenience (non-file) flags were passed. */
function hasConvenienceFlags(opts: ConversionWriteOpts): boolean {
  return (
    opts.gaProperty !== undefined ||
    opts.merchantCenter === true ||
    opts.currency !== undefined ||
    opts.displayName !== undefined
  );
}

/** Read a conversion-source body from `--file`, keeping only the writable source union keys. */
async function inputFromFile(file: string): Promise<ConversionSourceInput> {
  const input = pick<ConversionSourceInput>(
    await readJsonObject(file, "conversion source"),
    CONVERSION_SOURCE_FIELDS,
  );
  if (Object.keys(input).length === 0) {
    throw new UsageError(
      "The --file body has no conversion source fields.",
      "Provide a merchantCenterDestination or googleAnalyticsLink object.",
    );
  }
  return input;
}

/**
 * Build the create body. Exactly one source type is required: a Google Analytics link
 * (`--ga-property`) or a Merchant Center destination (`--merchant-center` + `--currency`),
 * or a full `--file` body. `--file` and the convenience flags are mutually exclusive.
 */
async function buildCreateInput(opts: ConversionWriteOpts): Promise<ConversionSourceInput> {
  if (opts.file) {
    if (hasConvenienceFlags(opts)) {
      throw new UsageError(
        "Pass either --file or the convenience flags, not both.",
        "Use --file for the full body, or --ga-property / --merchant-center for the common cases.",
      );
    }
    return inputFromFile(opts.file);
  }

  const wantsGa = opts.gaProperty !== undefined;
  const wantsMc =
    opts.merchantCenter === true || opts.currency !== undefined || opts.displayName !== undefined;

  if (wantsGa && wantsMc) {
    throw new UsageError(
      "A conversion source is one type.",
      "Pass --ga-property for a Google Analytics link, or --merchant-center for a Merchant Center destination, not both.",
    );
  }
  if (wantsGa) {
    return { googleAnalyticsLink: { propertyId: opts.gaProperty } };
  }
  if (wantsMc) {
    if (opts.currency === undefined) {
      throw new UsageError(
        "--currency is required for a Merchant Center destination.",
        "Pass --currency <ISO 4217 code>, e.g. --currency USD.",
      );
    }
    const dest: Partial<MerchantCenterDestination> = {
      currencyCode: opts.currency,
      ...(opts.displayName !== undefined ? { displayName: opts.displayName } : {}),
    };
    return { merchantCenterDestination: dest };
  }
  throw new UsageError(
    "A conversion source type is required.",
    "Pass --ga-property <id>, --merchant-center --currency <code>, or --file.",
  );
}

/**
 * Build the update body and its `updateMask`. A `--file` replaces the named source object
 * (mask = its top-level keys). The `--display-name` / `--currency` convenience flags patch
 * just those Merchant Center fields via a nested mask (`merchantCenterDestination.<field>`),
 * so the rest of the destination is untouched. The GA `propertyId` is immutable (no flag).
 */
async function buildUpdateInput(
  opts: ConversionWriteOpts,
): Promise<{ input: ConversionSourceInput; mask: string }> {
  if (opts.file) {
    if (hasConvenienceFlags(opts)) {
      throw new UsageError(
        "Pass either --file or the convenience flags, not both.",
        "Use --file for the full body, or --display-name / --currency for a Merchant Center patch.",
      );
    }
    const input = await inputFromFile(opts.file);
    return { input, mask: opts.updateMask ?? Object.keys(input).join(",") };
  }

  const dest: Partial<MerchantCenterDestination> = {};
  const maskFields: string[] = [];
  if (opts.displayName !== undefined) {
    dest.displayName = opts.displayName;
    maskFields.push("merchantCenterDestination.displayName");
  }
  if (opts.currency !== undefined) {
    dest.currencyCode = opts.currency;
    maskFields.push("merchantCenterDestination.currencyCode");
  }
  if (maskFields.length === 0) {
    throw new UsageError(
      "Nothing to update.",
      "Pass --display-name, --currency, or --file (with optional --update-mask).",
    );
  }
  return {
    input: { merchantCenterDestination: dest },
    mask: opts.updateMask ?? maskFields.join(","),
  };
}

/** The bare conversion-source id, preferring the resource `name` segment. */
function conversionIdOf(source: ConversionSource): string {
  return source.name ? conversionSourceSegment(source.name) : "—";
}

/** One-line source-type summary. */
function typeSummary(source: ConversionSource): string {
  if (source.googleAnalyticsLink) {
    return `GA property ${source.googleAnalyticsLink.propertyId ?? "—"}`;
  }
  if (source.merchantCenterDestination) {
    const d = source.merchantCenterDestination;
    return `Merchant Center${d.displayName ? ` "${d.displayName}"` : ""}${d.currencyCode ? ` (${d.currencyCode})` : ""}`;
  }
  return "—";
}

function renderConversions(sources: ConversionSource[]): void {
  if (sources.length === 0) {
    process.stdout.write("No conversion sources for this account.\n");
    return;
  }
  const width = Math.max(...sources.map((s) => conversionIdOf(s).length));
  process.stdout.write(`${sources.length} conversion source(s):\n`);
  for (const s of sources) {
    process.stdout.write(
      `  ${conversionIdOf(s).padEnd(width)}  ${s.state ?? "—"} · ${typeSummary(s)}\n`,
    );
  }
}

function renderConversion(source: ConversionSource): void {
  line("ID", conversionIdOf(source));
  if (source.state) line("State", source.state);
  if (source.controller) line("Controller", source.controller);
  line("Source", typeSummary(source));
  if (source.expireTime) line("Expires", source.expireTime);
}

/** Register the `gmc conversions` command group (list / get / create / update / delete / undelete). */
export function registerConversionsCommands(program: Command): void {
  const conversions = program
    .command("conversions")
    .description(
      "Manage conversion sources (Merchant Center destinations & Google Analytics links)",
    );

  conversions
    .command("list")
    .description("List conversion sources for the account")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new ConversionsService(await clientFor(ctx, account));
        const list = await service.listConversionSources();
        if (ctx.json) emitJson({ conversionSources: list });
        else renderConversions(list);
      } catch (err) {
        reportError(err, { json }, "gmc conversions list");
      }
    });

  conversions
    .command("get")
    .argument("<id>", "Conversion source id or resource name (from `conversions list`)")
    .description("Fetch one conversion source")
    .action(async (id: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new ConversionsService(await clientFor(ctx, account));
        const result = await service.getConversionSource(id);
        if (ctx.json) emitJson(result);
        else renderConversion(result);
      } catch (err) {
        reportError(err, { json }, "gmc conversions get");
      }
    });

  conversions
    .command("create")
    .option("--ga-property <propertyId>", "Create a Google Analytics link to this property id")
    .option("--merchant-center", "Create a Merchant Center destination source")
    .option("--currency <code>", "Destination currency (ISO 4217; required with --merchant-center)")
    .option("--display-name <name>", "Destination display name")
    .option("--file <path>", "Read the full ConversionSource JSON from this file (else stdin)")
    .description("Create a conversion source (its id is auto-generated)")
    .action(async (opts: ConversionWriteOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = await buildCreateInput(opts);
        const service = new ConversionsService(await clientFor(ctx, account));
        const result = await service.createConversionSource(input);
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Created conversion source ${conversionIdOf(result)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc conversions create");
      }
    });

  conversions
    .command("update")
    .argument("<id>", "Conversion source id or resource name")
    .option("--display-name <name>", "New Merchant Center destination display name")
    .option("--currency <code>", "New Merchant Center destination currency (ISO 4217)")
    .option("--file <path>", "Read the ConversionSource JSON body from this file")
    .option("--update-mask <fields>", "Explicit field mask (defaults to the fields you pass)")
    .description("Patch a conversion source (only the fields you pass are changed)")
    .action(async (id: string, opts: ConversionWriteOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const { input, mask } = await buildUpdateInput(opts);
        const service = new ConversionsService(await clientFor(ctx, account));
        const result = await service.updateConversionSource(id, input, { updateMask: mask });
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Updated conversion source ${conversionSourceSegment(id)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc conversions update");
      }
    });

  conversions
    .command("delete")
    .argument("<id>", "Conversion source id or resource name")
    .description("Archive a conversion source (soft-delete; restore with `undelete`)")
    .action(async (id: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new ConversionsService(await clientFor(ctx, account));
        await service.deleteConversionSource(id);
        const seg = conversionSourceSegment(id);
        if (ctx.json) emitJson({ deleted: seg });
        else process.stdout.write(`Archived conversion source ${seg}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc conversions delete");
      }
    });

  conversions
    .command("undelete")
    .argument("<id>", "Conversion source id or resource name")
    .description("Restore a previously archived conversion source")
    .action(async (id: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new ConversionsService(await clientFor(ctx, account));
        const result = await service.undeleteConversionSource(id);
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Restored conversion source ${conversionIdOf(result)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc conversions undelete");
      }
    });
}
