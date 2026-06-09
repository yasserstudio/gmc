import type { Command } from "commander";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emitJson, reportError, UsageError, ExitCode } from "@gmc-cli/core";
import {
  ProductsService,
  productSegment,
  toProductInput,
  type Product,
  type ProductInput,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, parsePageSize, requireDataSource } from "./_shared.js";

const DEFAULT_DIR = "feeds";

/** Safe per-product filename from its composite id; null if no id can be derived. */
function fileNameFor(product: Product): string | null {
  let segment = product.name ? productSegment(product.name) : "";
  if (!segment && product.offerId) {
    segment = [product.channel, product.contentLanguage, product.feedLabel, product.offerId]
      .filter(Boolean)
      .join("~");
  }
  if (!segment) return null;
  // Replace path separators and colon (Windows) so the id stays one path segment.
  return `${segment.replace(/[/\\:]/g, "_")}.json`;
}

/** Read and parse one product file as a push-ready ProductInput, or throw. */
async function readProductFile(path: string): Promise<ProductInput> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("not a JSON object");
  }
  return parsed as ProductInput;
}

/** Register the `gmc feeds` command group (pull / push; diff arrives in v0.9.2). */
export function registerFeedsCommands(program: Command): void {
  const feeds = program
    .command("feeds")
    .description("Sync product feeds as version-controllable files");

  feeds
    .command("pull")
    .description("Export the catalog to a directory of push-ready product files")
    .option("--dir <path>", "Output directory", DEFAULT_DIR)
    .option("--page-size <n>", "Max products per API page")
    .action(async (opts: { dir: string; pageSize?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const { dir } = opts;
        const service = new ProductsService(await clientFor(ctx, account));
        const products = await service.listProducts(pageSize ? { pageSize } : {});

        await mkdir(dir, { recursive: true });
        const seen = new Set<string>();
        let pulled = 0;
        let skipped = 0;
        for (const product of products) {
          const name = fileNameFor(product);
          // Skip a product with no derivable id, or whose filename already exists
          // this run (collision — don't silently overwrite).
          if (!name || seen.has(name)) {
            skipped += 1;
            continue;
          }
          seen.add(name);
          try {
            await writeFile(join(dir, name), `${JSON.stringify(toProductInput(product), null, 2)}\n`);
            pulled += 1;
          } catch {
            // e.g. an id with a NUL byte that the filesystem rejects.
            skipped += 1;
          }
        }

        if (ctx.json) {
          emitJson({ pulled, dir, ...(skipped ? { skipped } : {}) });
        } else {
          process.stdout.write(`Pulled ${pulled} product(s) to ${dir}.\n`);
          if (skipped) process.stdout.write(`Skipped ${skipped} product(s) (no id, conflict, or write error).\n`);
        }
      } catch (err) {
        reportError(err, { json }, "gmc feeds pull");
      }
    });

  feeds
    .command("push")
    .description("Apply a directory of product files to a target data source")
    .option("--dir <path>", "Input directory", DEFAULT_DIR)
    .option("--data-source <id>", "Target data source id or resource name (required)")
    .action(async (opts: { dir: string; dataSource?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        // Pulled files do NOT record their origin source (by design), so the
        // target is always explicit.
        const dataSource = requireDataSource(opts.dataSource, "push a feed");
        const { dir } = opts;

        let entries: string[];
        try {
          entries = await readdir(dir);
        } catch {
          throw new UsageError(
            `Could not read feed directory "${dir}".`,
            "Run `gmc feeds pull` first, or pass --dir <path> to an existing directory.",
          );
        }
        const files = entries.filter((f) => f.endsWith(".json")).sort();

        const service = new ProductsService(await clientFor(ctx, account));
        let pushed = 0;
        const failures: { file: string; error: string }[] = [];
        let apiError: unknown;
        for (const file of files) {
          // A malformed / non-object file is recorded and skipped so the rest of
          // the directory still applies. An API rejection is a different class of
          // problem — auth, a bad data source, an invalid product — and almost
          // always recurs for every file, so it aborts the run (inserts are
          // idempotent, so re-running after a fix is safe).
          let input: ProductInput;
          try {
            input = await readProductFile(join(dir, file));
          } catch (err) {
            failures.push({ file, error: err instanceof Error ? err.message : String(err) });
            continue;
          }
          try {
            await service.insertProductInput(input, dataSource);
            pushed += 1;
          } catch (err) {
            apiError = err;
            break;
          }
        }

        if (apiError) {
          // Surface how far the (idempotent) batch got before reporting the abort.
          if (!ctx.json && pushed > 0) {
            process.stdout.write(`Pushed ${pushed} product(s) before the error.\n`);
          }
          reportError(apiError, { json }, "gmc feeds push");
          return;
        }

        if (ctx.json) {
          emitJson({ pushed, dataSource, dir, ...(failures.length ? { failed: failures.length, failures } : {}) });
        } else {
          process.stdout.write(`Pushed ${pushed} product(s) to data source ${dataSource}.\n`);
          if (failures.length) {
            process.stdout.write(`Skipped ${failures.length} invalid file(s):\n`);
            for (const f of failures) process.stdout.write(`  - ${f.file}: ${f.error}\n`);
          }
          process.stdout.write("Processing is async; products may take a few minutes to appear in `products list`.\n");
        }
        // Partial failure (only local file errors reach here) → non-zero so CI can gate.
        if (failures.length) process.exitCode = ExitCode.Error;
      } catch (err) {
        reportError(err, { json }, "gmc feeds push");
      }
    });
}
