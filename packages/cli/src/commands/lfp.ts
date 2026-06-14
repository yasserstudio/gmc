import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  LfpService,
  lfpStoreSegment,
  toMicros,
  type LfpStore,
  type LfpStoreInput,
  type LfpInventoryInput,
  type LfpSaleInput,
  type Price,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, line, readJsonObject } from "./_shared.js";

// NOTE: every `gmc lfp` command targets the LFP **provider** account (resolved from
// --account / GMC_ACCOUNT_ID / profile). `--target-account` names the **merchant** the
// data is submitted for. This is the one sub-API where the scoped account is not the merchant.

interface StoreInsertOpts {
  targetAccount?: string;
  storeCode?: string;
  storeName?: string;
  storeAddress?: string;
  phone?: string;
  website?: string;
  placeId?: string;
  gcidCategory?: string;
  file?: string;
}
interface InventoryInsertOpts {
  targetAccount?: string;
  storeCode?: string;
  offerId?: string;
  regionCode?: string;
  contentLanguage?: string;
  feedLabel?: string;
  gtin?: string;
  quantity?: string;
  price?: string;
  currency?: string;
  availability?: string;
  pickupMethod?: string;
  pickupSla?: string;
  collectionTime?: string;
  file?: string;
}
interface SaleInsertOpts {
  targetAccount?: string;
  storeCode?: string;
  offerId?: string;
  regionCode?: string;
  contentLanguage?: string;
  feedLabel?: string;
  gtin?: string;
  quantity?: string;
  price?: string;
  currency?: string;
  saleTime?: string;
  file?: string;
}

/**
 * Resolve `--target-account` to the bare numeric Merchant Center id the LFP API expects
 * (the `targetAccount` field is an int64 id, NOT an `accounts/{id}` resource name). Accepts
 * a bare id or an `accounts/{id}` form and returns the bare id.
 */
function targetAccountId(raw: string): string {
  const bare = raw.replace(/^accounts\//, "");
  if (!/^\d+$/.test(bare)) {
    throw new UsageError(
      `Invalid --target-account "${raw}".`,
      "Pass the merchant's numeric Merchant Center id, e.g. 123456789.",
    );
  }
  return bare;
}

/** An int64-as-string quantity for the API; `allowNegative` permits a return (`-1`). */
function parseQuantity(raw: string, allowNegative: boolean): string {
  const re = allowNegative ? /^-?\d+$/ : /^\d+$/;
  if (!re.test(raw)) {
    throw new UsageError(
      `Invalid --quantity "${raw}".`,
      allowNegative ? "Use an integer (negative for a return)." : "Use a non-negative integer.",
    );
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

/** Common required-field check for the three inserts: a target merchant and a store. */
function requireTargetAndStore(
  input: { targetAccount?: string; storeCode?: string },
  what: string,
): void {
  if (!input.targetAccount) {
    throw new UsageError(
      `--target-account is required to insert ${what}.`,
      "Pass --target-account <merchant id>, or include targetAccount in --file.",
    );
  }
  if (!input.storeCode) {
    throw new UsageError(
      `--store-code is required to insert ${what}.`,
      "Pass --store-code <code>, or include storeCode in --file.",
    );
  }
}

async function buildStore(opts: StoreInsertOpts): Promise<LfpStoreInput> {
  const input: LfpStoreInput = opts.file
    ? ((await readJsonObject(opts.file, "LFP store")) as LfpStoreInput)
    : {};
  if (opts.targetAccount !== undefined) input.targetAccount = targetAccountId(opts.targetAccount);
  if (opts.storeCode !== undefined) input.storeCode = opts.storeCode;
  if (opts.storeName !== undefined) input.storeName = opts.storeName;
  if (opts.storeAddress !== undefined) input.storeAddress = opts.storeAddress;
  if (opts.phone !== undefined) input.phoneNumber = opts.phone;
  if (opts.website !== undefined) input.websiteUri = opts.website;
  if (opts.placeId !== undefined) input.placeId = opts.placeId;
  if (opts.gcidCategory !== undefined) {
    input.gcidCategory = opts.gcidCategory
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  requireTargetAndStore(input, "a store");
  return input;
}

async function buildInventory(opts: InventoryInsertOpts): Promise<LfpInventoryInput> {
  const input: LfpInventoryInput = opts.file
    ? ((await readJsonObject(opts.file, "LFP inventory")) as LfpInventoryInput)
    : {};
  if (opts.targetAccount !== undefined) input.targetAccount = targetAccountId(opts.targetAccount);
  if (opts.storeCode !== undefined) input.storeCode = opts.storeCode;
  if (opts.offerId !== undefined) input.offerId = opts.offerId;
  if (opts.regionCode !== undefined) input.regionCode = opts.regionCode;
  if (opts.contentLanguage !== undefined) input.contentLanguage = opts.contentLanguage;
  if (opts.feedLabel !== undefined) input.feedLabel = opts.feedLabel;
  if (opts.gtin !== undefined) input.gtin = opts.gtin;
  if (opts.availability !== undefined) input.availability = opts.availability;
  if (opts.pickupMethod !== undefined) input.pickupMethod = opts.pickupMethod;
  if (opts.pickupSla !== undefined) input.pickupSla = opts.pickupSla;
  if (opts.collectionTime !== undefined) input.collectionTime = opts.collectionTime;
  if (opts.quantity !== undefined) input.quantity = parseQuantity(opts.quantity, false);
  if (opts.price !== undefined) input.price = buildPrice(opts.price, opts.currency, input.price);
  requireTargetAndStore(input, "an inventory");
  if (!input.offerId) {
    throw new UsageError(
      "--offer-id is required to insert an inventory.",
      "Pass --offer-id <id>, or include offerId in --file.",
    );
  }
  return input;
}

async function buildSale(opts: SaleInsertOpts): Promise<LfpSaleInput> {
  const input: LfpSaleInput = opts.file
    ? ((await readJsonObject(opts.file, "LFP sale")) as LfpSaleInput)
    : {};
  if (opts.targetAccount !== undefined) input.targetAccount = targetAccountId(opts.targetAccount);
  if (opts.storeCode !== undefined) input.storeCode = opts.storeCode;
  if (opts.offerId !== undefined) input.offerId = opts.offerId;
  if (opts.regionCode !== undefined) input.regionCode = opts.regionCode;
  if (opts.contentLanguage !== undefined) input.contentLanguage = opts.contentLanguage;
  if (opts.feedLabel !== undefined) input.feedLabel = opts.feedLabel;
  if (opts.gtin !== undefined) input.gtin = opts.gtin;
  if (opts.saleTime !== undefined) input.saleTime = opts.saleTime;
  if (opts.quantity !== undefined) input.quantity = parseQuantity(opts.quantity, true);
  if (opts.price !== undefined) input.price = buildPrice(opts.price, opts.currency, input.price);
  requireTargetAndStore(input, "a sale");
  if (!input.offerId) {
    throw new UsageError(
      "--offer-id is required to insert a sale.",
      "Pass --offer-id <id>, or include offerId in --file.",
    );
  }
  return input;
}

/** The bare store id, preferring the resource `name` segment. */
function storeIdOf(store: LfpStore): string {
  return store.name ? lfpStoreSegment(store.name) : (store.storeCode ?? "—");
}

function renderStores(stores: LfpStore[]): void {
  if (stores.length === 0) {
    process.stdout.write("No LFP stores for this provider.\n");
    return;
  }
  const width = Math.max(...stores.map((s) => storeIdOf(s).length));
  process.stdout.write(`${stores.length} store(s):\n`);
  for (const s of stores) {
    const match = s.matchingState ? ` · ${s.matchingState}` : "";
    process.stdout.write(`  ${storeIdOf(s).padEnd(width)}  ${s.storeName ?? "—"}${match}\n`);
  }
}

function renderStore(store: LfpStore): void {
  line("Store", storeIdOf(store));
  if (store.storeName) line("Name", store.storeName);
  if (store.targetAccount) line("Merchant", store.targetAccount);
  if (store.storeAddress) line("Address", store.storeAddress);
  if (store.matchingState) line("Matching", store.matchingState);
}

/** Register the `gmc lfp` command group (Local Feeds Partnership — provider-side). */
export function registerLfpCommands(program: Command): void {
  const lfp = program
    .command("lfp")
    .description(
      "Local Feeds Partnership — provider submits stores/inventory/sales for target merchants",
    );

  const stores = lfp.command("stores").description("Manage the provider's registered stores");

  stores
    .command("list")
    .option("--target-account <id>", "Merchant account to list stores for (required)")
    .description("List the provider's LFP stores for a target merchant")
    .action(async (opts: { targetAccount?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        if (opts.targetAccount === undefined) {
          throw new UsageError(
            "--target-account is required to list stores.",
            "Pass --target-account <merchant id> (LFP stores are listed per merchant).",
          );
        }
        const service = new LfpService(await clientFor(ctx, account));
        const list = await service.listStores(targetAccountId(opts.targetAccount));
        if (ctx.json) emitJson({ lfpStores: list });
        else renderStores(list);
      } catch (err) {
        reportError(err, { json }, "gmc lfp stores list");
      }
    });

  stores
    .command("get")
    .argument("<id>", "Store id or resource name (from `lfp stores list`)")
    .description("Fetch one LFP store")
    .action(async (id: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new LfpService(await clientFor(ctx, account));
        const result = await service.getStore(id);
        if (ctx.json) emitJson(result);
        else renderStore(result);
      } catch (err) {
        reportError(err, { json }, "gmc lfp stores get");
      }
    });

  stores
    .command("insert")
    .option("--target-account <id>", "Merchant account the store belongs to (required)")
    .option("--store-code <code>", "Store code (required)")
    .option("--store-name <name>", "Store display name")
    .option("--store-address <addr>", "Single-line store address")
    .option("--phone <number>", "Store phone number")
    .option("--website <uri>", "Store website URI")
    .option("--place-id <id>", "Google Place ID")
    .option("--gcid-category <list>", "Comma-separated Google category ids")
    .option("--file <path>", "Read the LfpStore JSON base from this file")
    .description("Insert (create or replace) a store for a target merchant")
    .action(async (opts: StoreInsertOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = await buildStore(opts);
        const service = new LfpService(await clientFor(ctx, account));
        const result = await service.insertStore(input);
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Inserted store ${storeIdOf(result)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc lfp stores insert");
      }
    });

  stores
    .command("delete")
    .argument("<id>", "Store id or resource name")
    .description("Delete an LFP store")
    .action(async (id: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new LfpService(await clientFor(ctx, account));
        await service.deleteStore(id);
        const seg = lfpStoreSegment(id);
        if (ctx.json) emitJson({ deleted: seg });
        else process.stdout.write(`Deleted store ${seg}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc lfp stores delete");
      }
    });

  const inventory = lfp
    .command("inventory")
    .description("Submit local inventory for a target merchant");

  inventory
    .command("insert")
    .option("--target-account <id>", "Merchant account (required)")
    .option("--store-code <code>", "Store code (required)")
    .option("--offer-id <id>", "Product offer id (required)")
    .option("--region-code <cc>", "CLDR territory code, e.g. US")
    .option("--content-language <lang>", "Content language, e.g. en")
    .option("--feed-label <label>", "Feed label")
    .option("--gtin <gtin>", "Product GTIN")
    .option("--quantity <n>", "Stock at this store (non-negative integer)")
    .option("--price <amount>", "Price as a decimal (with --currency)")
    .option("--currency <code>", "3-letter currency code for --price")
    .option("--availability <value>", "e.g. in_stock / out_of_stock")
    .option("--pickup-method <value>", "Pickup method")
    .option("--pickup-sla <value>", "Pickup SLA")
    .option("--collection-time <ts>", "Collection timestamp (RFC 3339)")
    .option("--file <path>", "Read the LfpInventory JSON base from this file")
    .description("Insert (upsert) a local inventory entry")
    .action(async (opts: InventoryInsertOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = await buildInventory(opts);
        const service = new LfpService(await clientFor(ctx, account));
        const result = await service.insertInventory(input);
        if (ctx.json) emitJson(result);
        else
          process.stdout.write(
            `Submitted inventory for offer ${input.offerId} at store ${input.storeCode}.\n`,
          );
      } catch (err) {
        reportError(err, { json }, "gmc lfp inventory insert");
      }
    });

  const sales = lfp.command("sales").description("Submit local sales for a target merchant");

  sales
    .command("insert")
    .option("--target-account <id>", "Merchant account (required)")
    .option("--store-code <code>", "Store code (required)")
    .option("--offer-id <id>", "Product offer id (required)")
    .option("--region-code <cc>", "CLDR territory code, e.g. US")
    .option("--content-language <lang>", "Content language, e.g. en")
    .option("--feed-label <label>", "Feed label")
    .option("--gtin <gtin>", "Product GTIN")
    .option("--quantity <n>", "Quantity sold (integer; negative for a return)")
    .option("--price <amount>", "Unit price as a decimal (with --currency)")
    .option("--currency <code>", "3-letter currency code for --price")
    .option("--sale-time <ts>", "Sale timestamp (RFC 3339)")
    .option("--file <path>", "Read the LfpSale JSON base from this file")
    .description("Submit a local sale event")
    .action(async (opts: SaleInsertOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = await buildSale(opts);
        const service = new LfpService(await clientFor(ctx, account));
        const result = await service.insertSale(input);
        if (ctx.json) emitJson(result);
        else
          process.stdout.write(
            `Submitted sale for offer ${input.offerId} at store ${input.storeCode}.\n`,
          );
      } catch (err) {
        reportError(err, { json }, "gmc lfp sales insert");
      }
    });

  const state = lfp.command("state").description("Read a merchant's LFP onboarding state");

  state
    .command("get")
    .argument("<targetAccount>", "Merchant account id (or full resource name)")
    .description("Fetch the LFP merchant state (diagnostics) for a target merchant")
    .action(async (targetAccount: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new LfpService(await clientFor(ctx, account));
        const result = await service.getMerchantState(targetAccount);
        if (ctx.json) emitJson(result);
        else process.stdout.write(`${result.name ?? "(merchant state)"}\n`);
      } catch (err) {
        reportError(err, { json }, "gmc lfp state get");
      }
    });
}
