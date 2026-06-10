import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  InventoriesService,
  toMicros,
  type LocalInventory,
  type Price,
  type RegionalInventory,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, formatPrice, resolveAccount, readJsonObject } from "./_shared.js";

interface LocalInsertOpts {
  storeCode?: string;
  availability?: string;
  quantity?: string;
  price?: string;
  currency?: string;
  file?: string;
}
interface RegionalInsertOpts {
  region?: string;
  availability?: string;
  price?: string;
  currency?: string;
  file?: string;
}

/** A non-negative integer quantity string for the API (int64-as-string), or throw. */
function parseQuantity(raw: string): string {
  if (!/^\d+$/.test(raw)) {
    throw new UsageError(`Invalid --quantity "${raw}".`, "Use a non-negative integer.");
  }
  return raw;
}

/** Build a Price from `--price <decimal>` + `--currency`, falling back to a file currency. */
function buildPrice(
  amount: string,
  currency: string | undefined,
  existing: Price | undefined,
): Price {
  const amountMicros = toMicros(amount);
  if (amountMicros === null) {
    throw new UsageError(`Invalid --price "${amount}".`, "Use a non-negative decimal, e.g. 19.99.");
  }
  const currencyCode = currency ?? existing?.currencyCode;
  if (!currencyCode) {
    throw new UsageError(
      "--currency is required with --price.",
      "Pass --currency <code> (e.g. USD), or set price.currencyCode in --file.",
    );
  }
  return { amountMicros, currencyCode };
}

/** Read the optional `--file` JSON base, then overlay the common-field flags. */
async function buildLocalInventory(opts: LocalInsertOpts): Promise<LocalInventory> {
  const input: LocalInventory = opts.file
    ? ((await readJsonObject(opts.file, "local inventory")) as LocalInventory)
    : {};
  if (opts.storeCode) input.storeCode = opts.storeCode;
  if (opts.availability) input.availability = opts.availability;
  if (opts.quantity !== undefined) input.quantity = parseQuantity(opts.quantity);
  if (opts.price !== undefined) input.price = buildPrice(opts.price, opts.currency, input.price);
  if (!input.storeCode) {
    throw new UsageError(
      "--store-code is required to insert a local inventory.",
      "Pass --store-code <code>, or include storeCode in --file.",
    );
  }
  return input;
}

async function buildRegionalInventory(opts: RegionalInsertOpts): Promise<RegionalInventory> {
  const input: RegionalInventory = opts.file
    ? ((await readJsonObject(opts.file, "regional inventory")) as RegionalInventory)
    : {};
  if (opts.region) input.region = opts.region;
  if (opts.availability) input.availability = opts.availability;
  if (opts.price !== undefined) input.price = buildPrice(opts.price, opts.currency, input.price);
  if (!input.region) {
    throw new UsageError(
      "--region is required to insert a regional inventory.",
      "Pass --region <id> (an existing region for the account), or include region in --file.",
    );
  }
  return input;
}

function renderLocal(items: LocalInventory[]): void {
  if (items.length === 0) {
    process.stdout.write("No local inventories.\n");
    return;
  }
  const width = Math.max(...items.map((i) => (i.storeCode ?? "—").length));
  process.stdout.write(`${items.length} local inventory(ies):\n`);
  for (const li of items) {
    const parts = [li.availability ?? "—"];
    if (li.quantity !== undefined) parts.push(`qty ${li.quantity}`);
    if (li.price) parts.push(formatPrice(li.price));
    process.stdout.write(`  ${(li.storeCode ?? "—").padEnd(width)}  ${parts.join(" · ")}\n`);
  }
}

function renderRegional(items: RegionalInventory[]): void {
  if (items.length === 0) {
    process.stdout.write("No regional inventories.\n");
    return;
  }
  const width = Math.max(...items.map((i) => (i.region ?? "—").length));
  process.stdout.write(`${items.length} regional inventory(ies):\n`);
  for (const ri of items) {
    const parts = [ri.availability ?? "—"];
    if (ri.price) parts.push(formatPrice(ri.price));
    process.stdout.write(`  ${(ri.region ?? "—").padEnd(width)}  ${parts.join(" · ")}\n`);
  }
}

/** Register the `gmc inventory` command group (local / regional · list / insert / delete). */
export function registerInventoryCommands(program: Command): void {
  const inventory = program
    .command("inventory")
    .description("Manage per-store (local) and per-region (regional) inventory overrides");

  const local = inventory.command("local").description("Per-store inventory overrides");
  const regional = inventory.command("regional").description("Per-region inventory overrides");

  // ---- local ----
  local
    .command("list")
    .argument("<product>", "Product id or resource name (from `products list`)")
    .description("List local inventories for a product")
    .action(async (product: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new InventoriesService(await clientFor(ctx, account));
        const items = await service.listLocal(product);
        if (ctx.json) emitJson({ localInventories: items });
        else renderLocal(items);
      } catch (err) {
        reportError(err, { json }, "gmc inventory local list");
      }
    });

  local
    .command("insert")
    .argument("<product>", "Product id or resource name")
    .option("--store-code <code>", "Local store code (the inventory id)")
    .option("--availability <value>", "e.g. in_stock / out_of_stock")
    .option("--quantity <n>", "Stock at this store (non-negative integer)")
    .option("--price <amount>", "Price as a decimal (with --currency)")
    .option("--currency <code>", "3-letter currency code for --price")
    .option("--file <path>", "Read the LocalInventory JSON base from this file")
    .description("Insert (create or replace) a local inventory")
    .action(async (product: string, opts: LocalInsertOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = await buildLocalInventory(opts);
        const service = new InventoriesService(await clientFor(ctx, account));
        const result = await service.insertLocal(product, input);
        if (ctx.json) emitJson(result);
        else {
          process.stdout.write(`Set local inventory for store ${input.storeCode} on ${product}.\n`);
          // insert is a full replace — fields not sent are cleared, so a partial
          // flag update wipes anything previously set for this store.
          process.stdout.write(
            "This replaces the store's entire entry (unsent fields are cleared).\n",
          );
        }
      } catch (err) {
        reportError(err, { json }, "gmc inventory local insert");
      }
    });

  local
    .command("delete")
    .argument("<product>", "Product id or resource name")
    .option("--store-code <code>", "Local store code to delete")
    .description("Delete a local inventory by store code")
    .action(async (product: string, opts: { storeCode?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        if (!opts.storeCode) {
          throw new UsageError(
            "--store-code is required to delete a local inventory.",
            "Pass --store-code <code> (from `inventory local list`).",
          );
        }
        const service = new InventoriesService(await clientFor(ctx, account));
        await service.deleteLocal(product, opts.storeCode);
        if (ctx.json) emitJson({ deleted: opts.storeCode, product });
        else
          process.stdout.write(
            `Deleted local inventory for store ${opts.storeCode} on ${product}.\n`,
          );
      } catch (err) {
        reportError(err, { json }, "gmc inventory local delete");
      }
    });

  // ---- regional ----
  regional
    .command("list")
    .argument("<product>", "Product id or resource name")
    .description("List regional inventories for a product")
    .action(async (product: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new InventoriesService(await clientFor(ctx, account));
        const items = await service.listRegional(product);
        if (ctx.json) emitJson({ regionalInventories: items });
        else renderRegional(items);
      } catch (err) {
        reportError(err, { json }, "gmc inventory regional list");
      }
    });

  regional
    .command("insert")
    .argument("<product>", "Product id or resource name")
    .option("--region <id>", "Region id (the inventory id; must exist for the account)")
    .option("--availability <value>", "e.g. in_stock / out_of_stock")
    .option("--price <amount>", "Price as a decimal (with --currency)")
    .option("--currency <code>", "3-letter currency code for --price")
    .option("--file <path>", "Read the RegionalInventory JSON base from this file")
    .description("Insert (create or replace) a regional inventory")
    .action(async (product: string, opts: RegionalInsertOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = await buildRegionalInventory(opts);
        const service = new InventoriesService(await clientFor(ctx, account));
        const result = await service.insertRegional(product, input);
        if (ctx.json) emitJson(result);
        else {
          process.stdout.write(
            `Set regional inventory for region ${input.region} on ${product}.\n`,
          );
          process.stdout.write(
            "This replaces the region's entire entry (unsent fields are cleared).\n",
          );
        }
      } catch (err) {
        reportError(err, { json }, "gmc inventory regional insert");
      }
    });

  regional
    .command("delete")
    .argument("<product>", "Product id or resource name")
    .option("--region <id>", "Region id to delete")
    .description("Delete a regional inventory by region id")
    .action(async (product: string, opts: { region?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        if (!opts.region) {
          throw new UsageError(
            "--region is required to delete a regional inventory.",
            "Pass --region <id> (from `inventory regional list`).",
          );
        }
        const service = new InventoriesService(await clientFor(ctx, account));
        await service.deleteRegional(product, opts.region);
        if (ctx.json) emitJson({ deleted: opts.region, product });
        else
          process.stdout.write(
            `Deleted regional inventory for region ${opts.region} on ${product}.\n`,
          );
      } catch (err) {
        reportError(err, { json }, "gmc inventory regional delete");
      }
    });
}
