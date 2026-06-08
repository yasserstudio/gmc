import type { Command } from "commander";
import {
  createMerchantClient,
  emitJson,
  reportError,
  UsageError,
  type CommandContext,
} from "@gmc-cli/core";
import {
  AccountsService,
  type MerchantClient,
  type Account,
  type AccountInfo,
  type PostalAddress,
  type CustomerService,
} from "@gmc-cli/api";
import { getConfigDir } from "@gmc-cli/config";
import { contextFrom, wantsJson } from "../context.js";

/** Resolve the target account from a positional arg or the context, validating it. */
function resolveAccount(positional: string | undefined, ctx: CommandContext): string {
  const account = positional ?? ctx.accountId;
  if (!account) {
    throw new UsageError(
      "No Merchant Center account id given.",
      "Pass one as an argument (e.g. `gmc accounts get 123456789`), or set --account / GMC_ACCOUNT_ID / a profile.",
    );
  }
  // Merchant Center account ids are numeric (same rule @gmc-cli/config enforces).
  if (!/^\d+$/.test(account)) {
    throw new UsageError(`Invalid account id "${account}".`, "Account ids are numeric, e.g. 123456789.");
  }
  return account;
}

// The Accounts service targets each account explicitly per call, so the client
// itself is built unscoped (no accountId).
function clientFor(ctx: CommandContext): Promise<MerchantClient> {
  return createMerchantClient({ configDir: getConfigDir(), profile: ctx.profile });
}

function accountIdOf(account: Account): string {
  return account.accountId ?? account.name.replace(/^accounts\//, "");
}

function renderAccounts(accounts: Account[]): void {
  if (accounts.length === 0) {
    process.stdout.write("No accessible accounts.\n");
    return;
  }
  const rows = accounts.map((a) => ({
    id: accountIdOf(a),
    label: a.accountName ?? "—",
    test: a.testAccount === true,
  }));
  const idWidth = Math.max(...rows.map((r) => r.id.length));
  process.stdout.write(`${accounts.length} account(s):\n`);
  for (const r of rows) {
    process.stdout.write(`  ${r.id.padEnd(idWidth)}  ${r.label}${r.test ? " (test)" : ""}\n`);
  }
}

function line(label: string, value: string): void {
  process.stdout.write(`${label.padEnd(13)}${value}\n`);
}

function renderAccount(account: Account): void {
  line("Account ID", accountIdOf(account));
  line("Name", account.accountName ?? "—");
  if (account.timeZone?.id) line("Time zone", account.timeZone.id);
  if (account.languageCode) line("Language", account.languageCode);
  line("Test account", account.testAccount ? "yes" : "no");
  line("Adult content", account.adultContent ? "yes" : "no");
}

function formatAddress(address: PostalAddress): string {
  return [
    ...(address.addressLines ?? []),
    address.locality,
    address.administrativeArea,
    address.postalCode,
    address.regionCode,
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

function formatSupport(cs: CustomerService): string {
  return [cs.email, cs.phone?.number, cs.uri]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function renderAccountInfo(info: AccountInfo): void {
  const { account, businessInfo, homepage } = info;
  const id = accountIdOf(account);
  line("Account", account.accountName ? `${account.accountName} (${id})` : id);
  const type = account.testAccount ? "test account" : "standalone";
  line("Type", account.adultContent ? `${type} · adult content` : type);
  if (account.timeZone?.id || account.languageCode) {
    const tz = account.timeZone?.id ?? "—";
    line("Time zone", account.languageCode ? `${tz} · ${account.languageCode}` : tz);
  }
  if (homepage?.uri) {
    line("Homepage", `${homepage.uri}${homepage.claimed ? " (claimed ✓)" : " (unclaimed)"}`);
  }
  if (businessInfo?.address) {
    const address = formatAddress(businessInfo.address);
    if (address) line("Address", address);
  }
  if (businessInfo?.customerService) {
    const support = formatSupport(businessInfo.customerService);
    if (support) line("Support", support);
  }
}

/** Register the `gmc accounts` command group (list / get / info). */
export function registerAccountsCommands(program: Command): void {
  const accounts = program.command("accounts").description("Inspect Merchant Center accounts");

  accounts
    .command("list")
    .description("List accounts your credential can access")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const service = new AccountsService(await clientFor(ctx));
        const list = await service.listAccounts();
        if (ctx.json) emitJson({ accounts: list });
        else renderAccounts(list);
      } catch (err) {
        reportError(err, { json }, "gmc accounts list");
      }
    });

  accounts
    .command("get")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .description("Fetch a single account resource")
    .action(async (accountId?: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.getAccount(account);
        if (ctx.json) emitJson(result);
        else renderAccount(result);
      } catch (err) {
        reportError(err, { json }, "gmc accounts get");
      }
    });

  accounts
    .command("info")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .description("Show an account profile (account + business info + homepage)")
    .action(async (accountId?: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.getInfo(account);
        if (ctx.json) emitJson(result);
        else renderAccountInfo(result);
      } catch (err) {
        reportError(err, { json }, "gmc accounts info");
      }
    });
}
