import type { Command } from "commander";
import { emitJson, reportError } from "@gmc-cli/core";
import { ProductsService, productSegment, type Product, type ProductInput } from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import {
  clientFor,
  resolveAccount,
  readJsonObject,
  line,
  formatPrice,
  parsePageSize,
  requireDataSource,
} from "./_shared.js";

function offerIdOf(product: Product): string {
  return product.offerId ?? productSegment(product.name);
}

function issueSummary(product: Product): string {
  const issues = product.productStatus?.itemLevelIssues ?? [];
  if (issues.length === 0) return "no issues";
  const disapproved = issues.filter((i) => i.severity === "DISAPPROVED").length;
  return disapproved > 0
    ? `${disapproved} disapproved / ${issues.length} issue(s)`
    : `${issues.length} issue(s)`;
}

function renderProducts(products: Product[]): void {
  if (products.length === 0) {
    process.stdout.write("No products.\n");
    return;
  }
  const rows = products.map((p) => ({
    id: offerIdOf(p),
    title: p.productAttributes?.title ?? "—",
    avail: p.productAttributes?.availability ?? "—",
    issues: issueSummary(p),
  }));
  const idWidth = Math.max(...rows.map((r) => r.id.length));
  process.stdout.write(`${products.length} product(s):\n`);
  for (const r of rows) {
    process.stdout.write(`  ${r.id.padEnd(idWidth)}  ${r.title}  [${r.avail}] — ${r.issues}\n`);
  }
}

function renderProduct(product: Product): void {
  const a = product.productAttributes ?? {};
  line("Offer ID", offerIdOf(product));
  if (a.title) line("Title", a.title);
  if (a.link) line("Link", a.link);
  if (a.price?.amountMicros) line("Price", formatPrice(a.price));
  if (a.availability) line("Availability", a.availability);
  line("Status", issueSummary(product));
  for (const issue of product.productStatus?.itemLevelIssues ?? []) {
    const sev = issue.severity ? `${issue.severity}: ` : "";
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
        const dataSource = requireDataSource(opts.dataSource, "insert or delete a product");
        const input = (await readJsonObject(opts.file, "product input")) as ProductInput;
        const service = new ProductsService(await clientFor(ctx, account));
        const result = await service.insertProductInput(input, dataSource);
        if (ctx.json) emitJson(result);
        else {
          const id = result.offerId ?? input.offerId ?? "product";
          process.stdout.write(`Inserted ${id}${result.name ? ` (${result.name})` : ""}.\n`);
          process.stdout.write(
            "Processing is async; the product may take a few minutes to appear in `products get`.\n",
          );
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
        const dataSource = requireDataSource(opts.dataSource, "insert or delete a product");
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
