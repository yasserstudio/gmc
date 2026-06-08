import type { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emitJson, reportError } from "@gmc-cli/core";
import { ProductsService, productSegment, toProductInput, type Product } from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, parsePageSize } from "./_shared.js";

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

/** Register the `gmc feeds` command group (pull; push/diff arrive in v0.10–v0.11). */
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
}
