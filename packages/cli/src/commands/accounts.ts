import type { Command } from "commander";
import { emitJson, reportError } from "@gmc-cli/core";
import {
  AccountsService,
  type Account,
  type AccountInfo,
  type PostalAddress,
  type CustomerService,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount } from "./_shared.js";

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
