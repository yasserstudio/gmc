import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  RegionsService,
  regionSegment,
  type Region,
  type RegionInput,
  type PostalCodeArea,
  type GeoTargetArea,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, line, readJsonObject, parsePageSize, pick } from "./_shared.js";

interface RegionWriteOpts {
  displayName?: string;
  regionCode?: string;
  postalCodes?: string;
  geotargetIds?: string;
  file?: string;
  updateMask?: string;
}

/** The bare region id, preferring the resource `name` segment. */
function regionIdOf(region: Region): string {
  return region.name ? regionSegment(region.name) : "—";
}

/** Parse `--postal-codes "90210,10001-10005"` (+ `--region-code`) into a PostalCodeArea. */
function parsePostalCodes(raw: string, regionCode: string | undefined): PostalCodeArea {
  if (!regionCode) {
    throw new UsageError(
      "--region-code is required with --postal-codes.",
      "Pass --region-code <CLDR territory> (e.g. US).",
    );
  }
  // A token is a single code (`begin`) or a `begin-end` range; comma-separated.
  // (A bare ZIP+4 like 90210-1234 would be read as a range — pass those via --file.)
  const postalCodes = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((token) => {
      const parts = token.split("-").map((s) => s.trim());
      const [begin, end] = parts;
      if (!begin || parts.length > 2) {
        throw new UsageError(
          `Invalid postal code "${token}".`,
          "Use a code or a single begin-end range, e.g. 90210 or 10001-10005.",
        );
      }
      return end ? { begin, end } : { begin };
    });
  if (postalCodes.length === 0) {
    throw new UsageError("--postal-codes is empty.", "Pass at least one code or range.");
  }
  return { regionCode, postalCodes };
}

/** Parse `--geotarget-ids "21137,21138"` into a GeoTargetArea. */
function parseGeotargetIds(raw: string): GeoTargetArea {
  const geotargetCriteriaIds = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (geotargetCriteriaIds.length === 0) {
    throw new UsageError("--geotarget-ids is empty.", "Pass at least one geotarget criteria id.");
  }
  return { geotargetCriteriaIds };
}

/** The writable Region fields — everything else (`name`, the `*Eligible` flags) is output-only. */
const WRITABLE_FIELDS = [
  "displayName",
  "postalCodeArea",
  "geotargetArea",
  "radiusArea",
] as const satisfies readonly (keyof RegionInput)[];

/**
 * Build a RegionInput from `--file` (JSON base) overlaid with the convenience flags.
 * A region is defined by exactly one area; `requireArea` enforces that one is present
 * on create (patch may target just `--display-name`).
 */
async function buildRegionInput(opts: RegionWriteOpts, requireArea: boolean): Promise<RegionInput> {
  const input: RegionInput = opts.file
    ? pick<RegionInput>(await readJsonObject(opts.file, "region"), WRITABLE_FIELDS)
    : {};
  if (opts.regionCode && !opts.postalCodes) {
    throw new UsageError(
      "--region-code only applies with --postal-codes.",
      "Pass --postal-codes <codes> too, or drop --region-code.",
    );
  }
  if (opts.displayName) input.displayName = opts.displayName;
  if (opts.postalCodes) input.postalCodeArea = parsePostalCodes(opts.postalCodes, opts.regionCode);
  if (opts.geotargetIds) input.geotargetArea = parseGeotargetIds(opts.geotargetIds);

  // A radius area can only come from --file; treat its presence as an area too.
  const hasArea =
    Boolean(input.postalCodeArea) || Boolean(input.geotargetArea) || "radiusArea" in input;
  if (input.postalCodeArea && input.geotargetArea) {
    throw new UsageError(
      "A region is defined by exactly one area.",
      "Pass either --postal-codes (+ --region-code) or --geotarget-ids, not both.",
    );
  }
  if (requireArea && !hasArea) {
    throw new UsageError(
      "A region needs an area definition.",
      "Pass --postal-codes (+ --region-code), --geotarget-ids, or a full body via --file.",
    );
  }
  if (Object.keys(input).length === 0) {
    throw new UsageError(
      "Nothing to update.",
      "Pass --display-name, --postal-codes, --geotarget-ids, or --file.",
    );
  }
  return input;
}

/** One-line area summary for the list view. */
function areaSummary(region: Region): string {
  if (region.postalCodeArea) {
    const { regionCode, postalCodes } = region.postalCodeArea;
    return `${postalCodes?.length ?? 0} postal code(s) in ${regionCode ?? "—"}`;
  }
  if (region.geotargetArea) {
    return `${region.geotargetArea.geotargetCriteriaIds?.length ?? 0} geotarget(s)`;
  }
  if ("radiusArea" in region) return "radius area";
  return "—";
}

function renderRegions(regions: Region[]): void {
  if (regions.length === 0) {
    process.stdout.write("No regions defined for this account.\n");
    return;
  }
  const width = Math.max(...regions.map((r) => regionIdOf(r).length));
  process.stdout.write(`${regions.length} region(s):\n`);
  for (const r of regions) {
    const label = r.displayName ? `${r.displayName} · ` : "";
    process.stdout.write(`  ${regionIdOf(r).padEnd(width)}  ${label}${areaSummary(r)}\n`);
  }
}

function renderRegion(region: Region): void {
  line("Region ID", regionIdOf(region));
  if (region.displayName) line("Display name", region.displayName);
  line("Area", areaSummary(region));
  // Eligibility flags are output-only — only meaningful on a fetched region.
  if (region.regionalInventoryEligible !== undefined) {
    line("Inventory", region.regionalInventoryEligible ? "eligible" : "not eligible");
  }
  if (region.shippingEligible !== undefined) {
    line("Shipping", region.shippingEligible ? "eligible" : "not eligible");
  }
}

/** Register the `gmc regions` command group (list / get / create / update / delete). */
export function registerRegionsCommands(program: Command): void {
  const regions = program
    .command("regions")
    .description("Define geographic regions for regional inventory and shipping");

  regions
    .command("list")
    .option("--page-size <n>", "Max regions per API page")
    .description("List regions defined for the account")
    .action(async (opts: { pageSize?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const service = new RegionsService(await clientFor(ctx, account));
        const list = await service.listRegions(pageSize ? { pageSize } : {});
        if (ctx.json) emitJson({ regions: list });
        else renderRegions(list);
      } catch (err) {
        reportError(err, { json }, "gmc regions list");
      }
    });

  regions
    .command("get")
    .argument("<region>", "Region id or resource name")
    .description("Fetch a single region")
    .action(async (region: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new RegionsService(await clientFor(ctx, account));
        const result = await service.getRegion(region);
        if (ctx.json) emitJson(result);
        else renderRegion(result);
      } catch (err) {
        reportError(err, { json }, "gmc regions get");
      }
    });

  regions
    .command("create")
    .argument("<regionId>", "Merchant-supplied region id (unique for the account)")
    .option("--display-name <name>", "Human-readable name")
    .option("--region-code <cc>", "CLDR territory code for --postal-codes (e.g. US)")
    .option("--postal-codes <list>", "Comma-separated codes/ranges, e.g. 90210,10001-10005")
    .option("--geotarget-ids <list>", "Comma-separated geotarget criteria ids")
    .option("--file <path>", "Read the Region JSON body from this file")
    .description("Create a region (postal-code, geotarget, or radius area)")
    .action(async (regionId: string, opts: RegionWriteOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = await buildRegionInput(opts, true);
        const service = new RegionsService(await clientFor(ctx, account));
        const result = await service.createRegion(regionId, input);
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Created region ${regionId}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc regions create");
      }
    });

  regions
    .command("update")
    .argument("<region>", "Region id or resource name")
    .option("--display-name <name>", "Human-readable name")
    .option("--region-code <cc>", "CLDR territory code for --postal-codes (e.g. US)")
    .option("--postal-codes <list>", "Comma-separated codes/ranges (replaces the postal area)")
    .option("--geotarget-ids <list>", "Comma-separated geotarget criteria ids (replaces the area)")
    .option("--file <path>", "Read the Region JSON body from this file")
    .option("--update-mask <fields>", "Explicit field mask (defaults to the fields you pass)")
    .description("Patch a region (only the fields you pass are changed)")
    .action(async (region: string, opts: RegionWriteOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = await buildRegionInput(opts, false);
        const service = new RegionsService(await clientFor(ctx, account));
        const result = await service.updateRegion(region, input, {
          ...(opts.updateMask ? { updateMask: opts.updateMask } : {}),
        });
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Updated region ${regionSegment(region)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc regions update");
      }
    });

  regions
    .command("delete")
    .argument("<region>", "Region id or resource name")
    .description("Delete a region")
    .action(async (region: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new RegionsService(await clientFor(ctx, account));
        await service.deleteRegion(region);
        const id = regionSegment(region);
        if (ctx.json) emitJson({ deleted: id });
        else process.stdout.write(`Deleted region ${id}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc regions delete");
      }
    });
}
