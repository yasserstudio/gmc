// Typed Accounts sub-API service (Merchant API `accounts/v1`). A thin wrapper
// over MerchantClient: get a single account, list accessible accounts, and
// compose the `info` profile (account + business info + homepage). All calls run
// on the "accounts" rate-limit bucket. v0.7 adds ProductsService alongside this.

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
  phone?: Phone;
  customerService?: CustomerService;
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

/** One page of `accounts.list`. */
interface AccountsListPage {
  accounts?: Account[];
  nextPageToken?: string;
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

/** Read access to the Merchant API Accounts sub-API. */
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
    for await (const account of this.client.paginate<Account>("accounts", `${ACCOUNTS_API}/accounts`, {
      select: (page) => (page as AccountsListPage).accounts ?? [],
    })) {
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
}
