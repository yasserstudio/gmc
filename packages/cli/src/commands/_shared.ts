// Helpers shared by the Merchant API command groups (accounts, products,
// datasources, ...): resolving the target account, building a client from the
// invocation context, and reading JSON input from a file or stdin.

import { readFile } from "node:fs/promises";
import { createMerchantClient, UsageError, type CommandContext } from "@gmc-cli/core";
import type { MerchantClient } from "@gmc-cli/api";
import { getConfigDir } from "@gmc-cli/config";

/** Write a padded `label  value` line to stdout — shared detail-view renderer. */
export function line(label: string, value: string): void {
  process.stdout.write(`${label.padEnd(14)}${value}\n`);
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
    throw new UsageError(`Invalid account id "${account}".`, "Account ids are numeric, e.g. 123456789.");
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
      throw new UsageError(`Could not read ${label} file "${file}".`, "Check the path is correct and readable.");
    }
  } else if (process.stdin.isTTY) {
    throw new UsageError(`No ${label} provided.`, `Pass JSON via --file <path>, or pipe it to stdin.`);
  } else {
    raw = await readStdin();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(`The ${label} is not valid JSON.`, "Provide a JSON object via --file or stdin.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new UsageError(`The ${label} must be a JSON object.`, "Provide a single JSON object.");
  }
  return parsed as Record<string, unknown>;
}
