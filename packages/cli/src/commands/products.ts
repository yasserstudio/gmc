import type { Command } from "commander";
import { readFileSync } from "node:fs";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  ProductsService,
  productSegment,
  type Product,
  type ProductInput,
  type Price,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount } from "./_shared.js";

function requireDataSource(dataSource?: string): string {
  if (!dataSource) {
    throw new UsageError(
      "--data-source is required to insert or delete a product.",
      "Pass --data-source <id> (a primary API data source); data-source management arrives in v0.8.",
    );
  }
  return dataSource;
}

function parsePageSize(raw?: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new UsageError(`Invalid --page-size "${raw}".`, "Use a positive integer.");
  }
  return n;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  // Chunks are Buffers unless an upstream caller set an encoding (then strings).
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Read a ProductInput JSON from a file or stdin, validating it parses to an object. */
async function readProductInput(file?: string): Promise<ProductInput> {
  let raw: string;
  if (file) {
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      throw new UsageError(`Could not read product input file "${file}".`, "Check the path is correct and readable.");
    }
  } else if (process.stdin.isTTY) {
    throw new UsageError(
      "No product input provided.",
      "Pass a JSON ProductInput via --file <path>, or pipe it to stdin.",
    );
  } else {
    raw = await readStdin();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError("Product input is not valid JSON.", "Provide a JSON ProductInput via --file or stdin.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new UsageError(
      "Product input must be a JSON object.",
      'Provide a single ProductInput, e.g. { "offerId": "SKU1", "attributes": { ... } }.',
    );
  }
  return parsed as ProductInput;
}

function line(label: string, value: string): void {
  process.stdout.write(`${label.padEnd(14)}${value}\n`);
}

function offerIdOf(product: Product): string {
  return product.offerId ?? productSegment(product.name);
}

function formatPrice(price: Price): string {
  const micros = Number(price.amountMicros);
  const amount = Number.isFinite(micros) ? (micros / 1_000_000).toFixed(2) : "—";
  return `${amount} ${price.currencyCode ?? ""}`.trim();
}

function issueSummary(product: Product): string {
  const issues = product.productStatus?.itemLevelIssues ?? [];
  if (issues.length === 0) return "no issues";
  const disapproved = issues.filter((i) => i.servability === "disapproved").length;
  return disapproved > 0 ? `${disapproved} disapproved / ${issues.length} issue(s)` : `${issues.length} issue(s)`;
}

function renderProducts(products: Product[]): void {
  if (products.length === 0) {
    process.stdout.write("No products.\n");
    return;
  }
  const rows = products.map((p) => ({
    id: offerIdOf(p),
    title: p.attributes?.title ?? "—",
    avail: p.attributes?.availability ?? "—",
    issues: issueSummary(p),
  }));
  const idWidth = Math.max(...rows.map((r) => r.id.length));
  process.stdout.write(`${products.length} product(s):\n`);
  for (const r of rows) {
    process.stdout.write(`  ${r.id.padEnd(idWidth)}  ${r.title}  [${r.avail}] — ${r.issues}\n`);
  }
}

function renderProduct(product: Product): void {
  const a = product.attributes ?? {};
  line("Offer ID", offerIdOf(product));
  if (a.title) line("Title", a.title);
  if (a.link) line("Link", a.link);
  if (a.price?.amountMicros) line("Price", formatPrice(a.price));
  if (a.availability) line("Availability", a.availability);
  line("Status", issueSummary(product));
  for (const issue of product.productStatus?.itemLevelIssues ?? []) {
    const sev = issue.servability ? `${issue.servability}: ` : "";
    process.stdout.write(`    - ${sev}${issue.description ?? issue.code ?? "issue"}\n`);
  }
}

/** Register the `gmc products` command group (list / get / insert / delete). */
export function registerProductsCommands(program: Command): void {
  const products = program.command("products").description("Manage Merchant Center products");

  products
    .command("list")
    .option("--page-size <n>", "Max products per API page")
    .description("List processed products for the account")
    .action(async (opts: { pageSize?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const service = new ProductsService(await clientFor(ctx, account));
        const list = await service.listProducts(pageSize ? { pageSize } : {});
        if (ctx.json) emitJson({ products: list });
        else renderProducts(list);
      } catch (err) {
        reportError(err, { json }, "gmc products list");
      }
    });

  products
    .command("get")
    .argument("<productId>", "Product id or resource name (from `products list`)")
    .description("Fetch one processed product with its status")
    .action(async (productId: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new ProductsService(await clientFor(ctx, account));
        const result = await service.getProduct(productId);
        if (ctx.json) emitJson(result);
        else renderProduct(result);
      } catch (err) {
        reportError(err, { json }, "gmc products get");
      }
    });

  products
    .command("insert")
    .option("--data-source <id>", "Data source id or resource name to insert under")
    .option("--file <path>", "Read the ProductInput JSON from this file (else stdin)")
    .description("Insert a product input (create or replace) from JSON")
    .action(async (opts: { dataSource?: string; file?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const dataSource = requireDataSource(opts.dataSource);
        const input = await readProductInput(opts.file);
        const service = new ProductsService(await clientFor(ctx, account));
        const result = await service.insertProductInput(input, dataSource);
        if (ctx.json) emitJson(result);
        else {
          const id = result.offerId ?? input.offerId ?? "product";
          process.stdout.write(`Inserted ${id}${result.name ? ` (${result.name})` : ""}.\n`);
          process.stdout.write("Processing is async; the product may take a few minutes to appear in `products get`.\n");
        }
      } catch (err) {
        reportError(err, { json }, "gmc products insert");
      }
    });

  products
    .command("delete")
    .argument("<productId>", "Product id or resource name (from `products list`)")
    .option("--data-source <id>", "Data source id or resource name to delete from")
    .description("Delete a product input")
    .action(async (productId: string, opts: { dataSource?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const dataSource = requireDataSource(opts.dataSource);
        const service = new ProductsService(await clientFor(ctx, account));
        await service.deleteProductInput(productId, dataSource);
        // Echo the canonical product segment, not the raw argument form.
        if (ctx.json) emitJson({ deleted: productSegment(productId) });
        else process.stdout.write(`Deleted ${productSegment(productId)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc products delete");
      }
    });
}
