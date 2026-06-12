import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  AccountsService,
  userSegment,
  accountResourceName,
  type Account,
  type AccountUpdate,
  type AccountInfo,
  type BusinessInfoInput,
  type Homepage,
  type User,
  type UserInput,
  type AccessRight,
  type CreateAccountRequest,
  type PostalAddress,
  type CustomerService,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, line, readJsonObject } from "./_shared.js";

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

/** Parse a `--flag true|false` value into a boolean, or throw a UsageError. */
function parseBool(raw: string, flag: string): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new UsageError(`Invalid ${flag} "${raw}".`, "Pass true or false.");
}

// `satisfies` ties each field list to its input type, so adding a writable field to
// `AccountUpdate`/`BusinessInfoInput` without listing it here (or a typo) is a compile error.

/** The writable Account fields — everything else is output-only or an identifier. */
const ACCOUNT_FIELDS = [
  "accountName",
  "adultContent",
  "timeZone",
  "languageCode",
] as const satisfies readonly (keyof AccountUpdate)[];

/** The writable BusinessInfo fields — `name`/`phone`/`phoneVerificationState` are output-only. */
const BUSINESS_INFO_FIELDS = [
  "address",
  "customerService",
  "koreanBusinessRegistrationNumber",
] as const satisfies readonly (keyof BusinessInfoInput)[];

/**
 * Keep only the writable keys of a parsed `--file` body, dropping output-only fields
 * the API rejects in a PATCH `updateMask`. Mirrors `pickWritable` in `regions.ts`, so a
 * body saved from `accounts get`/`info` can be re-applied as-is. `fields` is constrained
 * to keys of `T`, so the field list can't drift from the return type.
 */
function pick<T>(obj: Record<string, unknown>, fields: readonly (keyof T & string)[]): T {
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in obj) out[key] = obj[key];
  }
  return out as T;
}

function renderHomepage(homepage: Homepage): void {
  line("URI", homepage.uri ?? "—");
  line("Claimed", homepage.claimed ? "yes" : "no");
}

/** The access rights the Accounts API accepts (see the AccessRight enum). */
const ACCESS_RIGHTS: readonly AccessRight[] = [
  "STANDARD",
  "READ_ONLY",
  "ADMIN",
  "PERFORMANCE_REPORTING",
  "API_DEVELOPER",
];

/** Parse the required `--access-rights "admin,standard"` flag into a deduped, validated list. */
function parseAccessRights(raw: string | undefined): AccessRight[] {
  if (!raw) {
    throw new UsageError(
      "--access-rights is required.",
      `Pass a comma-separated list of: ${ACCESS_RIGHTS.join(", ")}.`,
    );
  }
  const seen = new Set<AccessRight>();
  for (const token of raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)) {
    const right = token.toUpperCase();
    if (!(ACCESS_RIGHTS as readonly string[]).includes(right)) {
      throw new UsageError(
        `Invalid access right "${token}".`,
        `Use a comma-separated list of: ${ACCESS_RIGHTS.join(", ")}.`,
      );
    }
    seen.add(right as AccessRight);
  }
  if (seen.size === 0) {
    throw new UsageError(
      "--access-rights is empty.",
      `Pass at least one of: ${ACCESS_RIGHTS.join(", ")}.`,
    );
  }
  return [...seen];
}

/** The bare email id of a user, preferring the resource `name` segment. */
function userEmailOf(user: User): string {
  return user.name ? userSegment(user.name) : "—";
}

function renderUsers(users: User[]): void {
  if (users.length === 0) {
    process.stdout.write("No users on this account.\n");
    return;
  }
  const width = Math.max(...users.map((u) => userEmailOf(u).length));
  process.stdout.write(`${users.length} user(s):\n`);
  for (const u of users) {
    const rights = u.accessRights?.join(", ") ?? "—";
    const state = u.state ? ` [${u.state}]` : "";
    process.stdout.write(`  ${userEmailOf(u).padEnd(width)}  ${rights}${state}\n`);
  }
}

function renderUser(user: User): void {
  line("Email", userEmailOf(user));
  if (user.state) line("State", user.state);
  line("Access rights", user.accessRights?.join(", ") ?? "—");
}

interface AccountWriteOpts {
  name?: string;
  adultContent?: string;
  timeZone?: string;
  language?: string;
  file?: string;
  updateMask?: string;
}

/** Build an AccountUpdate from `--file` overlaid with the convenience flags, or throw. */
async function buildAccountUpdate(opts: AccountWriteOpts): Promise<AccountUpdate> {
  const input: AccountUpdate = opts.file
    ? pick<AccountUpdate>(await readJsonObject(opts.file, "account"), ACCOUNT_FIELDS)
    : {};
  if (opts.name !== undefined) input.accountName = opts.name;
  if (opts.adultContent !== undefined) {
    input.adultContent = parseBool(opts.adultContent, "--adult-content");
  }
  if (opts.timeZone !== undefined) input.timeZone = { id: opts.timeZone };
  if (opts.language !== undefined) input.languageCode = opts.language;
  if (Object.keys(input).length === 0) {
    throw new UsageError(
      "Nothing to update.",
      "Pass --name, --adult-content, --time-zone, --language, or --file.",
    );
  }
  return input;
}

interface AccountCreateOpts {
  name?: string;
  timeZone?: string;
  language?: string;
  adultContent?: string;
  aggregator?: string;
  file?: string;
}

/**
 * Build the `accounts:createAndConfigure` body from `--file` overlaid with the convenience
 * flags. Unlike a patch, the `--file` body is kept whole (it legitimately carries
 * `account` / `service` / `user` / `setAlias`); the flags build/override `account` and add
 * the standard `--aggregator` service. Requires a name and at least one service.
 */
async function buildCreateRequest(opts: AccountCreateOpts): Promise<CreateAccountRequest> {
  const base: Record<string, unknown> = opts.file
    ? await readJsonObject(opts.file, "account request")
    : {};
  // Shallow-copy the account / service that a `--file` body may carry, so the flags
  // and `--aggregator` build on a copy rather than mutating the parsed body in place.
  const account: AccountUpdate = { ...(base["account"] as AccountUpdate | undefined) };
  if (opts.name !== undefined) account.accountName = opts.name;
  if (opts.timeZone !== undefined) account.timeZone = { id: opts.timeZone };
  if (opts.language !== undefined) account.languageCode = opts.language;
  if (opts.adultContent !== undefined) {
    account.adultContent = parseBool(opts.adultContent, "--adult-content");
  }

  const service: CreateAccountRequest["service"] = Array.isArray(base["service"])
    ? [...(base["service"] as CreateAccountRequest["service"])]
    : [];
  if (opts.aggregator !== undefined) {
    if (!/^\d+$/.test(opts.aggregator)) {
      throw new UsageError(
        `Invalid --aggregator "${opts.aggregator}".`,
        "Account ids are numeric, e.g. 123456789.",
      );
    }
    service.push({ accountAggregation: {}, provider: accountResourceName(opts.aggregator) });
  }

  if (!account.accountName) {
    throw new UsageError(
      "A new account needs a name.",
      "Pass --name (or an `account.accountName` in --file).",
    );
  }
  if (service.length === 0) {
    throw new UsageError(
      "A new account needs a service relationship.",
      "Pass --aggregator <id> to create a sub-account, or a `service` array in --file.",
    );
  }
  return { ...base, account, service };
}

/** Register the `gmc accounts` command group (list / get / info / update + business-info / homepage). */
export function registerAccountsCommands(program: Command): void {
  const accounts = program
    .command("accounts")
    .description("Inspect and manage Merchant Center accounts");

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

  accounts
    .command("update")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .option("--name <name>", "Account display name")
    .option("--adult-content <bool>", "Whether the account offers adult content (true/false)")
    .option("--time-zone <id>", "IANA time zone id, e.g. America/New_York")
    .option("--language <code>", "BCP-47 language code, e.g. en-US")
    .option("--file <path>", "Read the Account JSON body from this file")
    .option("--update-mask <fields>", "Explicit field mask (defaults to the fields you pass)")
    .description("Patch an account (only the fields you pass are changed)")
    .action(async (accountId: string | undefined, opts: AccountWriteOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const input = await buildAccountUpdate(opts);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.updateAccount(account, input, {
          ...(opts.updateMask ? { updateMask: opts.updateMask } : {}),
        });
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Updated account ${account}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc accounts update");
      }
    });

  const businessInfo = accounts
    .command("business-info")
    .description("Manage an account's business info (address, customer service)");

  businessInfo
    .command("update")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .option("--file <path>", "Read the BusinessInfo JSON body from this file")
    .option("--korean-brn <number>", "10-digit Korean business registration number")
    .option("--update-mask <fields>", "Explicit field mask (defaults to the fields you pass)")
    .description("Patch an account's business info (only the fields you pass are changed)")
    .action(
      async (
        accountId: string | undefined,
        opts: { file?: string; koreanBrn?: string; updateMask?: string },
      ) => {
        const json = wantsJson(program);
        try {
          const ctx = contextFrom(program);
          const account = resolveAccount(accountId, ctx);
          const input: BusinessInfoInput = opts.file
            ? pick<BusinessInfoInput>(
                await readJsonObject(opts.file, "business info"),
                BUSINESS_INFO_FIELDS,
              )
            : {};
          if (opts.koreanBrn !== undefined) input.koreanBusinessRegistrationNumber = opts.koreanBrn;
          if (Object.keys(input).length === 0) {
            throw new UsageError(
              "Nothing to update.",
              "Pass --file (address / customerService) or --korean-brn.",
            );
          }
          const service = new AccountsService(await clientFor(ctx));
          const result = await service.updateBusinessInfo(account, input, {
            ...(opts.updateMask ? { updateMask: opts.updateMask } : {}),
          });
          if (ctx.json) emitJson(result);
          else process.stdout.write(`Updated business info for account ${account}.\n`);
        } catch (err) {
          reportError(err, { json }, "gmc accounts business-info update");
        }
      },
    );

  const homepage = accounts
    .command("homepage")
    .description("Manage an account's online store homepage (URI + claim status)");

  homepage
    .command("get")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .description("Show the homepage URI and claim status")
    .action(async (accountId: string | undefined) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.getHomepage(account);
        if (ctx.json) emitJson(result);
        else renderHomepage(result);
      } catch (err) {
        reportError(err, { json }, "gmc accounts homepage get");
      }
    });

  homepage
    .command("set")
    .argument("<uri>", "Homepage URI, e.g. https://mystore.com")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .description("Set the homepage URI")
    .action(async (uri: string, accountId: string | undefined) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.updateHomepage(account, { uri });
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Set homepage for account ${account} to ${uri}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc accounts homepage set");
      }
    });

  homepage
    .command("claim")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .option("--overwrite", "Take the claim from another account that currently holds it")
    .description("Claim the homepage")
    .action(async (accountId: string | undefined, opts: { overwrite?: boolean }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.claimHomepage(account, {
          ...(opts.overwrite ? { overwrite: true } : {}),
        });
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Claimed homepage for account ${account}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc accounts homepage claim");
      }
    });

  homepage
    .command("unclaim")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .description("Unclaim the homepage")
    .action(async (accountId: string | undefined) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.unclaimHomepage(account);
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Unclaimed homepage for account ${account}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc accounts homepage unclaim");
      }
    });

  const users = accounts
    .command("users")
    .description("Manage who can access the account and their access rights");

  users
    .command("list")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .description("List users with access to the account")
    .action(async (accountId: string | undefined) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        const list = await service.listUsers(account);
        if (ctx.json) emitJson({ users: list });
        else renderUsers(list);
      } catch (err) {
        reportError(err, { json }, "gmc accounts users list");
      }
    });

  users
    .command("get")
    .argument("<email>", "User email (or `me`)")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .description("Fetch a single user")
    .action(async (email: string, accountId: string | undefined) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.getUser(account, email);
        if (ctx.json) emitJson(result);
        else renderUser(result);
      } catch (err) {
        reportError(err, { json }, "gmc accounts users get");
      }
    });

  users
    .command("add")
    .argument("<email>", "User email to add")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .option("--access-rights <list>", `Comma-separated: ${ACCESS_RIGHTS.join(", ")}`)
    .description("Add a user to the account")
    .action(
      async (email: string, accountId: string | undefined, opts: { accessRights?: string }) => {
        const json = wantsJson(program);
        try {
          const ctx = contextFrom(program);
          const account = resolveAccount(accountId, ctx);
          const input: UserInput = { accessRights: parseAccessRights(opts.accessRights) };
          const service = new AccountsService(await clientFor(ctx));
          const result = await service.createUser(account, email, input);
          if (ctx.json) emitJson(result);
          else process.stdout.write(`Added user ${userSegment(email)} to account ${account}.\n`);
        } catch (err) {
          reportError(err, { json }, "gmc accounts users add");
        }
      },
    );

  users
    .command("update")
    .argument("<email>", "User email (or `me`)")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .option("--access-rights <list>", `Comma-separated: ${ACCESS_RIGHTS.join(", ")}`)
    .description("Replace a user's access rights")
    .action(
      async (email: string, accountId: string | undefined, opts: { accessRights?: string }) => {
        const json = wantsJson(program);
        try {
          const ctx = contextFrom(program);
          const account = resolveAccount(accountId, ctx);
          const input: UserInput = { accessRights: parseAccessRights(opts.accessRights) };
          const service = new AccountsService(await clientFor(ctx));
          const result = await service.updateUser(account, email, input);
          if (ctx.json) emitJson(result);
          else process.stdout.write(`Updated user ${userSegment(email)}.\n`);
        } catch (err) {
          reportError(err, { json }, "gmc accounts users update");
        }
      },
    );

  users
    .command("remove")
    .argument("<email>", "User email to remove")
    .argument("[accountId]", "Account id (defaults to --account / profile)")
    .description("Remove a user from the account")
    .action(async (email: string, accountId: string | undefined) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        const service = new AccountsService(await clientFor(ctx));
        await service.deleteUser(account, email);
        const id = userSegment(email);
        if (ctx.json) emitJson({ removed: id });
        else process.stdout.write(`Removed user ${id} from account ${account}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc accounts users remove");
      }
    });

  accounts
    .command("create")
    .option("--name <name>", "Account display name (required)")
    .option("--time-zone <id>", "IANA time zone id, e.g. America/New_York")
    .option("--language <code>", "BCP-47 language code, e.g. en-US")
    .option("--adult-content <bool>", "Whether the account offers adult content (true/false)")
    .option("--aggregator <id>", "Create a sub-account under this advanced/aggregator account")
    .option("--file <path>", "Read the full createAndConfigure JSON body from this file")
    .description("Create and configure an account (typically a sub-account)")
    .action(async (opts: AccountCreateOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const body = await buildCreateRequest(opts);
        const service = new AccountsService(await clientFor(ctx));
        const result = await service.createAccount(body);
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Created account ${accountIdOf(result)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc accounts create");
      }
    });

  accounts
    .command("delete")
    .argument("<accountId>", "Account id to delete (required — no profile fallback)")
    .option("--yes", "Confirm the irreversible deletion (required)")
    .option("--force", "Delete even if it has sub-accounts or processed offers")
    .description("Delete an account (irreversible)")
    .action(async (accountId: string, opts: { yes?: boolean; force?: boolean }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(accountId, ctx);
        if (!opts.yes) {
          throw new UsageError(
            `Refusing to delete account ${account} without --yes.`,
            "Account deletion is irreversible — pass --yes to confirm (and --force if it has sub-accounts or processed offers).",
          );
        }
        const service = new AccountsService(await clientFor(ctx));
        await service.deleteAccount(account, { ...(opts.force ? { force: true } : {}) });
        if (ctx.json) emitJson({ deleted: account });
        else process.stdout.write(`Deleted account ${account}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc accounts delete");
      }
    });
}
