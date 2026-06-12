// Typed Accounts sub-API service (Merchant API `accounts/v1`). A thin wrapper
// over MerchantClient: read a single account, list accessible accounts, and
// compose the `info` profile (account + business info + homepage); plus profile
// writes — patch the account / business info / homepage, claim / unclaim the
// homepage, and full CRUD on account users / access rights (mirroring `regions`'
// patch shape). All calls run on the "accounts" rate-limit bucket. v0.7 adds
// ProductsService alongside this.

import type { MerchantClient } from "./client.js";
import { MerchantApiError } from "./errors.js";

const ACCOUNTS_API = "accounts/v1";

// The interfaces below model only the fields the CLI reads; the Merchant API
// returns more. `client.get` returns the full parsed JSON (these types are a
// compile-time view, not a runtime filter), so `--json` output is never lossy.

/** google.type.TimeZone (subset). */
export interface TimeZone {
  id?: string;
  version?: string;
}

/** A Merchant Center account (`accounts/{account}`). */
export interface Account {
  name: string;
  accountId?: string;
  accountName?: string;
  adultContent?: boolean;
  testAccount?: boolean;
  timeZone?: TimeZone;
  languageCode?: string;
}

/** Subset of google.type.PostalAddress the CLI renders. */
export interface PostalAddress {
  regionCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  addressLines?: string[];
}

/** A phone number as returned by the Accounts sub-API (subset). */
export interface Phone {
  regionCode?: string;
  number?: string;
}

export interface CustomerService {
  uri?: string;
  email?: string;
  phone?: Phone;
}

/** Business profile for an account (`accounts/{account}/businessInfo`). */
export interface BusinessInfo {
  name: string;
  address?: PostalAddress;
  /** Output-only: the verified business phone (set via Merchant Center, not writable here). */
  phone?: Phone;
  customerService?: CustomerService;
  /** The 10-digit Korean business registration number (writable; Korea only). */
  koreanBusinessRegistrationNumber?: string;
}

/** Online store homepage for an account (`accounts/{account}/homepage`). */
export interface Homepage {
  name: string;
  uri?: string;
  claimed?: boolean;
}

/** Composite "account profile" returned by {@link AccountsService.getInfo}. */
export interface AccountInfo {
  account: Account;
  /** null when the account has no business info (404). */
  businessInfo: BusinessInfo | null;
  /** null when the account has no homepage configured (404). */
  homepage: Homepage | null;
}

/** The writable subset of an Account accepted on patch (`updateAccount`). */
export type AccountUpdate = Pick<
  Account,
  "accountName" | "adultContent" | "timeZone" | "languageCode"
>;

/**
 * The writable subset of a BusinessInfo accepted on patch (`updateBusinessInfo`).
 * `phone` (and `phoneVerificationState`) are output-only, so they're excluded.
 */
export type BusinessInfoInput = Pick<
  BusinessInfo,
  "address" | "customerService" | "koreanBusinessRegistrationNumber"
>;

/** The writable subset of a Homepage accepted on patch (`updateHomepage`). */
export type HomepageInput = Pick<Homepage, "uri">;

/** An access right a user can hold on an account. */
export type AccessRight =
  | "STANDARD"
  | "READ_ONLY"
  | "ADMIN"
  | "PERFORMANCE_REPORTING"
  | "API_DEVELOPER";

/**
 * A user with access to an account (`accounts/{account}/users/{email}`). `name` and
 * `state` (PENDING / VERIFIED) are output-only; `accessRights` is the writable field.
 */
export interface User {
  /** Output-only resource name: `accounts/{account}/users/{email}`. */
  name?: string;
  /** Output-only: `PENDING` until the user accepts, then `VERIFIED`. */
  state?: string;
  accessRights?: AccessRight[];
}

/** The writable subset of a User accepted on create / patch. */
export type UserInput = Pick<User, "accessRights">;

/** One page of `accounts.list`. */
interface AccountsListPage {
  accounts?: Account[];
  nextPageToken?: string;
}

/** One page of `accounts.users.list`. */
interface UsersListPage {
  users?: User[];
  nextPageToken?: string;
}

/**
 * Reduce a user email or full resource name to its bare email id, so callers can pass
 * either an email (or `me`) or the `name` returned by `list`.
 */
export function userSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/users\//, "");
}

/**
 * Normalize a bare numeric id or an `accounts/{id}` resource name to the
 * `accounts/{id}` path segment, percent-encoding the id.
 */
export function accountResourceName(account: string): string {
  const id = account.replace(/^accounts\//, "");
  return `accounts/${encodeURIComponent(id)}`;
}

// A missing sub-resource (no business info / unclaimed homepage) is normal for
// some accounts — fold its 404 into a null so `info` still renders the rest.
function notFoundToNull(err: unknown): null {
  if (err instanceof MerchantApiError && err.httpStatus === 404) return null;
  throw err;
}

/** Read and write access to the Merchant API Accounts sub-API. */
export class AccountsService {
  constructor(private readonly client: MerchantClient) {}

  /** Fetch a single account resource. */
  getAccount(account: string): Promise<Account> {
    return this.client.get<Account>("accounts", `${ACCOUNTS_API}/${accountResourceName(account)}`);
  }

  /**
   * List every account the credential can access. Drains all pages eagerly into
   * an array (the CLI renders them together); for very large account trees a
   * caller wanting to stream should use {@link MerchantClient.paginate} directly.
   */
  async listAccounts(): Promise<Account[]> {
    const accounts: Account[] = [];
    for await (const account of this.client.paginate<Account>(
      "accounts",
      `${ACCOUNTS_API}/accounts`,
      {
        select: (page) => (page as AccountsListPage).accounts ?? [],
      },
    )) {
      accounts.push(account);
    }
    return accounts;
  }

  /** Fetch an account's business info (address, phone, customer service). */
  getBusinessInfo(account: string): Promise<BusinessInfo> {
    return this.client.get<BusinessInfo>(
      "accounts",
      `${ACCOUNTS_API}/${accountResourceName(account)}/businessInfo`,
    );
  }

  /** Fetch an account's homepage (uri + claim status). */
  getHomepage(account: string): Promise<Homepage> {
    return this.client.get<Homepage>(
      "accounts",
      `${ACCOUNTS_API}/${accountResourceName(account)}/homepage`,
    );
  }

  /**
   * Compose the `info` profile: the account plus its business info and homepage.
   * Throws if the account itself is missing (404); business info / homepage
   * resolve to null when absent (404) so a partial account still produces a report.
   */
  async getInfo(account: string): Promise<AccountInfo> {
    const [acct, businessInfo, homepage] = await Promise.all([
      this.getAccount(account),
      this.getBusinessInfo(account).catch(notFoundToNull),
      this.getHomepage(account).catch(notFoundToNull),
    ]);
    return { account: acct, businessInfo, homepage };
  }

  /**
   * Patch an account. The `updateMask` lists the fields to replace; when omitted it
   * defaults to the input's own top-level keys, so only what you pass is changed.
   * Mirrors `regions.patch` — `client.request` attaches the `updateMask` query param.
   */
  updateAccount(
    account: string,
    input: AccountUpdate,
    opts: { updateMask?: string } = {},
  ): Promise<Account> {
    const updateMask = opts.updateMask ?? Object.keys(input).join(",");
    return this.client.request<Account>(
      "accounts",
      "PATCH",
      `${ACCOUNTS_API}/${accountResourceName(account)}`,
      { query: { updateMask }, body: input },
    );
  }

  /** Patch an account's business info (address, customer service, Korean BRN). */
  updateBusinessInfo(
    account: string,
    input: BusinessInfoInput,
    opts: { updateMask?: string } = {},
  ): Promise<BusinessInfo> {
    const updateMask = opts.updateMask ?? Object.keys(input).join(",");
    return this.client.request<BusinessInfo>(
      "accounts",
      "PATCH",
      `${ACCOUNTS_API}/${accountResourceName(account)}/businessInfo`,
      { query: { updateMask }, body: input },
    );
  }

  /** Set an account's homepage URI. */
  updateHomepage(
    account: string,
    input: HomepageInput,
    opts: { updateMask?: string } = {},
  ): Promise<Homepage> {
    const updateMask = opts.updateMask ?? Object.keys(input).join(",");
    return this.client.request<Homepage>(
      "accounts",
      "PATCH",
      `${ACCOUNTS_API}/${accountResourceName(account)}/homepage`,
      { query: { updateMask }, body: input },
    );
  }

  /**
   * Claim the account's homepage (`homepage:claim`). Pass `overwrite: true` to take
   * the claim from another account that currently holds it.
   */
  claimHomepage(account: string, opts: { overwrite?: boolean } = {}): Promise<Homepage> {
    return this.client.request<Homepage>(
      "accounts",
      "POST",
      `${ACCOUNTS_API}/${accountResourceName(account)}/homepage:claim`,
      { body: opts.overwrite === undefined ? {} : { overwrite: opts.overwrite } },
    );
  }

  /** Unclaim the account's homepage (`homepage:unclaim`). */
  unclaimHomepage(account: string): Promise<Homepage> {
    return this.client.request<Homepage>(
      "accounts",
      "POST",
      `${ACCOUNTS_API}/${accountResourceName(account)}/homepage:unclaim`,
    );
  }

  /** The `accounts/{account}/users` path the user sub-resource hangs off. */
  private usersBase(account: string): string {
    return `${ACCOUNTS_API}/${accountResourceName(account)}/users`;
  }

  /** List every user with access to the account, following pagination. */
  async listUsers(account: string): Promise<User[]> {
    const users: User[] = [];
    for await (const u of this.client.paginate<User>("accounts", this.usersBase(account), {
      select: (page) => (page as UsersListPage).users ?? [],
    })) {
      users.push(u);
    }
    return users;
  }

  /** Fetch a single user by email (or `me`). Accepts an email or a full resource name. */
  getUser(account: string, email: string): Promise<User> {
    return this.client.get<User>(
      "accounts",
      `${this.usersBase(account)}/${encodeURIComponent(userSegment(email))}`,
    );
  }

  /**
   * Add a user. The email is supplied as a `userId` query param (the body is the User
   * itself) — mirrors `regions.create` / `productInputs:insert`. Fails if the user
   * already exists.
   */
  createUser(account: string, email: string, input: UserInput): Promise<User> {
    return this.client.request<User>("accounts", "POST", this.usersBase(account), {
      query: { userId: userSegment(email) },
      body: input,
    });
  }

  /**
   * Patch a user. The `updateMask` defaults to the input's own keys (so a plain
   * `{ accessRights }` replaces just the access rights); pass `updateMask` to override.
   */
  updateUser(
    account: string,
    email: string,
    input: UserInput,
    opts: { updateMask?: string } = {},
  ): Promise<User> {
    const updateMask = opts.updateMask ?? Object.keys(input).join(",");
    return this.client.request<User>(
      "accounts",
      "PATCH",
      `${this.usersBase(account)}/${encodeURIComponent(userSegment(email))}`,
      { query: { updateMask }, body: input },
    );
  }

  /** Remove a user by email. */
  async deleteUser(account: string, email: string): Promise<void> {
    await this.client.delete<undefined>(
      "accounts",
      `${this.usersBase(account)}/${encodeURIComponent(userSegment(email))}`,
    );
  }
}
