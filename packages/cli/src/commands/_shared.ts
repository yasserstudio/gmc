// Helpers shared by the Merchant API command groups (accounts, products,
// datasources, ...): resolving the target account, building a client from the
// invocation context, and reading JSON input from a file or stdin.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createMerchantClient, UsageError, type CommandContext } from "@gmc-cli/core";
import { productSegment, type MerchantClient, type Price, type ProductInput } from "@gmc-cli/api";
import { getConfigDir } from "@gmc-cli/config";

/** Write a padded `label  value` line to stdout — shared detail-view renderer. */
export function line(label: string, value: string): void {
  process.stdout.write(`${label.padEnd(14)}${value}\n`);
}

/** Render a Merchant API Price (`amountMicros` / `currencyCode`) as `12.34 USD`. */
export function formatPrice(price: Price): string {
  const micros = Number(price.amountMicros);
  const amount = Number.isFinite(micros) ? (micros / 1_000_000).toFixed(2) : "—";
  return `${amount} ${price.currencyCode ?? ""}`.trim();
}

/**
 * Filesystem-safe per-product filename from its composite id (`{contentLanguage}~
 * {feedLabel}~{offerId}`, `local~`-prefixed for legacy-local products); null if no
 * id can be derived. Prefers a processed product's `name` segment, else builds from
 * the identity fields. Shared by `feeds pull` (from a Product) and `migrate products`
 * (from a ProductInput) so both name files identically. Path separators / colon are
 * replaced so the id stays one path segment.
 */
export function productFileName(p: {
  name?: string;
  legacyLocal?: boolean;
  contentLanguage?: string;
  feedLabel?: string;
  offerId?: string;
}): string | null {
  let segment = p.name ? productSegment(p.name) : "";
  if (!segment && p.offerId) {
    const core = [p.contentLanguage, p.feedLabel, p.offerId].filter(Boolean).join("~");
    segment = p.legacyLocal ? `local~${core}` : core;
  }
  if (!segment) return null;
  return `${segment.replace(/[/\\:]/g, "_")}.json`;
}

/** The Merchant API's largest documented page size — values above this are rejected. */
const MAX_PAGE_SIZE = 1000;

/** Parse a positive-integer `--page-size` flag, or throw a UsageError. */
export function parsePageSize(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  // Require plain digits so "1e21" can't pass Number() and reach the query string
  // as "1e+21" (which the API rejects with an opaque 400). Cap at the API maximum.
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(n) || n <= 0 || n > MAX_PAGE_SIZE) {
    throw new UsageError(
      `Invalid --page-size "${raw}".`,
      `Use a positive integer up to ${MAX_PAGE_SIZE}.`,
    );
  }
  return n;
}

/**
 * Require a `--data-source` for product write operations (insert / delete / feeds
 * push), or throw a UsageError. `action` names the operation in the message.
 * Accepts a bare id or a full resource name.
 */
export function requireDataSource(
  dataSource: string | undefined,
  action = "write products",
): string {
  if (!dataSource) {
    throw new UsageError(
      `--data-source is required to ${action}.`,
      "Pass --data-source <id> (a primary API data source) — create one with `gmc datasources create`.",
    );
  }
  return dataSource;
}

/**
 * Resolve the target account from a positional arg or the context, validating it.
 * `positional` is undefined for commands that take the account only from
 * --account / GMC_ACCOUNT_ID / profile (e.g. products); accounts get/info also
 * accept it as an argument.
 */
export function resolveAccount(positional: string | undefined, ctx: CommandContext): string {
  const account = positional ?? ctx.accountId;
  if (!account) {
    throw new UsageError(
      "No Merchant Center account id given.",
      "Set --account / GMC_ACCOUNT_ID / a profile (accounts commands also accept it as an argument).",
    );
  }
  // Merchant Center account ids are numeric (same rule @gmc-cli/config enforces).
  if (!/^\d+$/.test(account)) {
    throw new UsageError(
      `Invalid account id "${account}".`,
      "Account ids are numeric, e.g. 123456789.",
    );
  }
  return account;
}

/**
 * Build a MerchantClient from the context. Pass `accountId` to scope the client
 * to one account (so the service can use `client.accountResource`); omit it for
 * account-agnostic calls like `accounts list`.
 */
export function clientFor(ctx: CommandContext, accountId?: string): Promise<MerchantClient> {
  return createMerchantClient({
    configDir: getConfigDir(),
    profile: ctx.profile,
    ...(accountId ? { accountId } : {}),
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  // Chunks are Buffers unless an upstream caller set an encoding (then strings).
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Read a JSON object from a file or stdin, validating it parses to a plain object.
 * `label` names the payload in error messages (e.g. "product input", "data source").
 * With no file and a TTY stdin it throws (nothing to read).
 */
export async function readJsonObject(
  file: string | undefined,
  label: string,
): Promise<Record<string, unknown>> {
  let raw: string;
  if (file) {
    try {
      raw = await readFile(file, "utf8");
    } catch {
      throw new UsageError(
        `Could not read ${label} file "${file}".`,
        "Check the path is correct and readable.",
      );
    }
  } else if (process.stdin.isTTY) {
    throw new UsageError(
      `No ${label} provided.`,
      `Pass JSON via --file <path>, or pipe it to stdin.`,
    );
  } else {
    raw = await readStdin();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(
      `The ${label} is not valid JSON.`,
      "Provide a JSON object via --file or stdin.",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new UsageError(`The ${label} must be a JSON object.`, "Provide a single JSON object.");
  }
  return parsed as Record<string, unknown>;
}

/** A feed file that couldn't be read or parsed as a product input. */
export interface FileLoadFailure {
  file: string;
  error: string;
}

/** The result of reading a directory of product files: the good ones and the bad. */
export interface LoadedFeed {
  files: { file: string; input: ProductInput }[];
  failures: FileLoadFailure[];
}

/** Read and parse one product file as a push-ready ProductInput, or throw. */
async function readProductFile(path: string): Promise<ProductInput> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("not a JSON object");
  }
  return parsed as ProductInput;
}

/** How many feed files to read at once — big feeds are I/O-bound, not CPU-bound. */
const READ_CONCURRENCY = 16;

/**
 * Read every `*.json` file in `dir` (name order) and parse each as a ProductInput.
 * Shared by `feeds push` / `feeds diff` / `preflight`: a malformed / non-object file
 * is recorded as a failure rather than thrown, so one bad file doesn't sink the whole
 * directory. An unreadable directory IS fatal (UsageError) — there's nothing to
 * operate on.
 *
 * Files are read with bounded concurrency, but results are reassembled in name order
 * so the output is deterministic regardless of which read finishes first.
 */
export async function loadProductFiles(dir: string): Promise<LoadedFeed> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new UsageError(
      `Could not read feed directory "${dir}".`,
      "Run `gmc feeds pull` first, or pass --dir <path> to an existing directory.",
    );
  }
  const names = entries.filter((f) => f.endsWith(".json")).sort();

  type Slot = { file: string; input: ProductInput } | FileLoadFailure;
  const results = new Array<Slot>(names.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < names.length) {
      const i = next++;
      const file = names[i];
      if (file === undefined) continue; // unreachable (i < length); satisfies the index check
      try {
        results[i] = { file, input: await readProductFile(join(dir, file)) };
      } catch (err) {
        results[i] = { file, error: err instanceof Error ? err.message : String(err) };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(READ_CONCURRENCY, names.length) }, () => worker()),
  );

  const files: LoadedFeed["files"] = [];
  const failures: FileLoadFailure[] = [];
  for (const slot of results) {
    if ("input" in slot) files.push(slot);
    else failures.push(slot);
  }
  return { files, failures };
}
