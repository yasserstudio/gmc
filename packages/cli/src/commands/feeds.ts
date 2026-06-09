import type { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emitJson, reportError, ExitCode } from "@gmc-cli/core";
import {
  ProductsService,
  productSegment,
  toProductInput,
  type Product,
  type ProductInput,
} from "@gmc-cli/api";
import { productKey } from "@gmc-cli/preflight";
import { contextFrom, wantsJson } from "../context.js";
import {
  clientFor,
  resolveAccount,
  parsePageSize,
  requireDataSource,
  loadProductFiles,
  type FileLoadFailure,
} from "./_shared.js";

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

/** Normalize a data source id or full resource name to its bare id, for matching. */
function dataSourceId(dataSource: string): string {
  return dataSource.replace(/^.*dataSources\//, "");
}

/**
 * Order-independent serialization (object keys sorted recursively) for deep
 * equality. Both sides are always JSON-sourced — a parsed file vs a Product mapped
 * through `toProductInput` — so leaves are only string/number/boolean/null and the
 * `?? "null"` guards an unreachable `undefined`. Array order IS significant and is
 * preserved (e.g. `customAttributes`).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** Human-readable `feeds diff` output: the +/~/- change list, summary, and any skips. */
function renderDiffHuman(
  dir: string,
  result: { added: string[]; updated: string[]; unchanged: number; orphaned: string[] },
  failures: FileLoadFailure[],
): void {
  const { added, updated, unchanged, orphaned } = result;
  if (added.length + updated.length + orphaned.length === 0) {
    process.stdout.write(`No changes — ${dir} matches the catalog (${unchanged} unchanged).\n`);
  } else {
    process.stdout.write(`${dir} vs catalog:\n`);
    for (const id of added) process.stdout.write(`  + ${id}\n`);
    for (const id of updated) process.stdout.write(`  ~ ${id}\n`);
    for (const id of orphaned) process.stdout.write(`  - ${id}  (only in catalog)\n`);
    process.stdout.write(
      `${added.length} to add, ${updated.length} to update, ${unchanged} unchanged` +
        (orphaned.length ? `, ${orphaned.length} only in catalog (push won't remove)` : "") +
        ".\n",
    );
  }
  if (failures.length) {
    process.stdout.write(`Skipped ${failures.length} invalid file(s):\n`);
    for (const f of failures) process.stdout.write(`  - ${f.file}: ${f.error}\n`);
  }
}

/** Register the `gmc feeds` command group (pull / push / diff). */
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
            await writeFile(
              join(dir, name),
              `${JSON.stringify(toProductInput(product), null, 2)}\n`,
            );
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
          if (skipped)
            process.stdout.write(
              `Skipped ${skipped} product(s) (no id, conflict, or write error).\n`,
            );
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

        // Parse the whole directory up front; invalid files become `failures`.
        const { files, failures } = await loadProductFiles(dir);

        const service = new ProductsService(await clientFor(ctx, account));
        let pushed = 0;
        let apiError: unknown;
        for (const { input } of files) {
          // An API rejection is a different class of problem from a bad file —
          // auth, a bad data source, an invalid product — and almost always recurs
          // for every file, so it aborts the run (inserts are idempotent, so
          // re-running after a fix is safe).
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
          emitJson({
            pushed,
            dataSource,
            dir,
            ...(failures.length ? { failed: failures.length, failures } : {}),
          });
        } else {
          process.stdout.write(`Pushed ${pushed} product(s) to data source ${dataSource}.\n`);
          if (failures.length) {
            process.stdout.write(`Skipped ${failures.length} invalid file(s):\n`);
            for (const f of failures) process.stdout.write(`  - ${f.file}: ${f.error}\n`);
          }
          process.stdout.write(
            "Processing is async; products may take a few minutes to appear in `products list`.\n",
          );
        }
        // Partial failure (only local file errors reach here) → non-zero so CI can gate.
        if (failures.length) process.exitCode = ExitCode.Error;
      } catch (err) {
        reportError(err, { json }, "gmc feeds push");
      }
    });

  feeds
    .command("diff")
    .description("Show what `push` would change vs the current catalog")
    .option("--dir <path>", "Input directory", DEFAULT_DIR)
    .option("--data-source <id>", "Only compare against products from this data source")
    .option("--page-size <n>", "Max products per API page")
    .action(async (opts: { dir: string; dataSource?: string; pageSize?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const pageSize = parsePageSize(opts.pageSize);
        const { dir } = opts;
        // `push` targets one data source; scope the comparison to it when given so
        // diff is an exact preview of `push --data-source <id>`. Without it, diff
        // compares against the whole catalog (all data sources) — a product living
        // under a different source then reads as `added` (push would create it
        // under the target), not as a match.
        const sourceFilter = opts.dataSource ? dataSourceId(opts.dataSource) : undefined;

        const { files, failures } = await loadProductFiles(dir);
        const local = new Map<string, ProductInput>();
        for (const { input } of files) local.set(productKey(input), input);

        const service = new ProductsService(await clientFor(ctx, account));
        const remoteProducts = await service.listProducts(pageSize ? { pageSize } : {});
        const remote = new Map<string, ProductInput>();
        for (const product of remoteProducts) {
          if (sourceFilter && dataSourceId(product.dataSource ?? "") !== sourceFilter) continue;
          const remoteInput = toProductInput(product);
          remote.set(productKey(remoteInput), remoteInput);
        }

        // `push` only inserts/replaces, so catalog-only products ("orphaned") are
        // reported but never removed.
        const added: string[] = [];
        const updated: string[] = [];
        let unchanged = 0;
        for (const [id, localInput] of local) {
          const current = remote.get(id);
          if (!current) added.push(id);
          else if (stableStringify(localInput) !== stableStringify(current)) updated.push(id);
          else unchanged += 1;
        }
        const orphaned = [...remote.keys()].filter((id) => !local.has(id));
        added.sort();
        updated.sort();
        orphaned.sort();

        if (ctx.json) {
          emitJson({
            added,
            updated,
            unchanged,
            orphaned,
            dir,
            ...(sourceFilter ? { dataSource: sourceFilter } : {}),
            ...(failures.length ? { failed: failures.length, failures } : {}),
          });
        } else {
          renderDiffHuman(dir, { added, updated, unchanged, orphaned }, failures);
        }
        // Differences are informational (exit 0); only invalid local files fail the run.
        if (failures.length) process.exitCode = ExitCode.Error;
      } catch (err) {
        reportError(err, { json }, "gmc feeds diff");
      }
    });
}
