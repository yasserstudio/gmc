// Typed LFP service (Merchant API `lfp/v1`) — the Local Feeds Partnership API.
// IMPORTANT: this is a PROVIDER-side API. The account the client is scoped to is the
// **LFP provider**, and every resource carries a `targetAccount` naming the **merchant**
// the data is submitted for. (Every other gmc sub-API treats the scoped account as the
// merchant itself; LFP is the exception.) Providers submit local store / inventory / sales
// data on behalf of the merchants they manage.
//
// Resources: lfpStores (list/get/insert/delete), lfpInventories (insert-only),
// lfpSales (insert-only), lfpMerchantStates (get-only — diagnostics). The `insert` verbs
// are upserts on the `<collection>:insert` colon path with the resource as the body
// (verified against the lfp_v1 discovery doc). Lives on the new "lfp" rate-limit bucket.

import type { MerchantClient } from "./client.js";
import type { Price } from "./products.js";

const LFP_API = "lfp/v1";

// As elsewhere, these model the fields the CLI reads/writes; the API round-trips the full
// JSON via `client.get`/`request`, so `--json` and the submitted bodies are never lossy.

/**
 * A physical store a provider registers for a merchant
 * (`accounts/{provider}/lfpStores/{targetMerchant}~{storeCode}`). `name`, `matchingState`,
 * and `matchingStateHint` are output-only (the match to a Google Business Profile location).
 */
export interface LfpStore {
  /** Output-only resource name: `accounts/{provider}/lfpStores/{id}`. */
  name?: string;
  /** The merchant this store belongs to (`accounts/{merchant}` or a bare id). */
  targetAccount?: string;
  storeCode?: string;
  storeName?: string;
  /** Single-line address of the store. */
  storeAddress?: string;
  phoneNumber?: string;
  websiteUri?: string;
  /** Google Place ID of the store location. */
  placeId?: string;
  /** Google category ids describing the store. */
  gcidCategory?: string[];
  /** Output-only: whether the store matched a Business Profile location. */
  matchingState?: string;
  /** Output-only: hint on why a store did/didn't match. */
  matchingStateHint?: string;
}

/** The writable subset of an LfpStore accepted on insert. */
export type LfpStoreInput = Pick<
  LfpStore,
  | "targetAccount"
  | "storeCode"
  | "storeName"
  | "storeAddress"
  | "phoneNumber"
  | "websiteUri"
  | "placeId"
  | "gcidCategory"
>;

/**
 * A local inventory entry for one product at one store
 * (`accounts/{provider}/lfpInventories`). Insert-only (an upsert keyed by
 * target/store/offer/region/language). `name` is output-only.
 */
export interface LfpInventory {
  /** Output-only resource name. */
  name?: string;
  targetAccount?: string;
  storeCode?: string;
  offerId?: string;
  regionCode?: string;
  contentLanguage?: string;
  feedLabel?: string;
  gtin?: string;
  price?: Price;
  /** Available quantity (int64 as string). */
  quantity?: string;
  availability?: string;
  pickupMethod?: string;
  pickupSla?: string;
  collectionTime?: string;
}

/** The writable subset of an LfpInventory accepted on insert. */
export type LfpInventoryInput = Pick<
  LfpInventory,
  | "targetAccount"
  | "storeCode"
  | "offerId"
  | "regionCode"
  | "contentLanguage"
  | "feedLabel"
  | "gtin"
  | "price"
  | "quantity"
  | "availability"
  | "pickupMethod"
  | "pickupSla"
  | "collectionTime"
>;

/**
 * A local sale event (`accounts/{provider}/lfpSales`). Insert-only. `name` and `uid`
 * are output-only.
 */
export interface LfpSale {
  /** Output-only resource name. */
  name?: string;
  /** Output-only unique id assigned to the submitted sale. */
  uid?: string;
  targetAccount?: string;
  storeCode?: string;
  offerId?: string;
  regionCode?: string;
  contentLanguage?: string;
  feedLabel?: string;
  gtin?: string;
  price?: Price;
  /** Quantity sold (int64 as string; negative for a return). */
  quantity?: string;
  saleTime?: string;
}

/** The writable subset of an LfpSale accepted on insert. */
export type LfpSaleInput = Pick<
  LfpSale,
  | "targetAccount"
  | "storeCode"
  | "offerId"
  | "regionCode"
  | "contentLanguage"
  | "feedLabel"
  | "gtin"
  | "price"
  | "quantity"
  | "saleTime"
>;

/**
 * A merchant's LFP onboarding state (`accounts/{provider}/lfpMerchantStates/{merchant}`) —
 * read-only diagnostics: per-country settings, per-store match states, inventory stats, and
 * linked Google Business Profile ids. The nested shapes are rich; they round-trip via `--json`.
 */
export interface LfpMerchantState {
  name?: string;
  countrySettings?: unknown[];
  storeStates?: unknown[];
  linkedGbps?: string;
  inventoryStats?: unknown;
}

/** One page of `lfpStores.list`. */
interface LfpStoresListPage {
  lfpStores?: LfpStore[];
  nextPageToken?: string;
}

/** Reduce an LfpStore id or full resource name to its bare id. */
export function lfpStoreSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/lfpStores\//, "");
}

/** Reduce a merchant-state id or full resource name to the bare target-account id. */
export function lfpMerchantStateSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/lfpMerchantStates\//, "");
}

/** Provider-side access to the Merchant API Local Feeds Partnership sub-API. */
export class LfpService {
  constructor(private readonly client: MerchantClient) {}

  /** `lfp/v1/accounts/{provider}/{collection}` — the provider account is the path account. */
  private base(collection: string): string {
    return `${LFP_API}/${this.client.accountResource}/${collection}`;
  }

  /**
   * List the stores the provider has registered for one merchant, following pagination.
   * `targetAccount` (the merchant's numeric Merchant Center id) is a required query filter.
   */
  async listStores(targetAccount: string): Promise<LfpStore[]> {
    const stores: LfpStore[] = [];
    for await (const s of this.client.paginate<LfpStore>("lfp", this.base("lfpStores"), {
      query: { targetAccount },
      select: (page) => (page as LfpStoresListPage).lfpStores ?? [],
    })) {
      stores.push(s);
    }
    return stores;
  }

  /** Fetch a single store by id (or full resource name). */
  getStore(idOrName: string): Promise<LfpStore> {
    return this.client.get<LfpStore>(
      "lfp",
      `${this.base("lfpStores")}/${encodeURIComponent(lfpStoreSegment(idOrName))}`,
    );
  }

  /** Insert (upsert) a store for a target merchant (`lfpStores:insert`). */
  insertStore(body: LfpStoreInput): Promise<LfpStore> {
    return this.client.request<LfpStore>("lfp", "POST", `${this.base("lfpStores")}:insert`, {
      body,
    });
  }

  /** Delete a store by id. */
  async deleteStore(idOrName: string): Promise<void> {
    await this.client.delete<undefined>(
      "lfp",
      `${this.base("lfpStores")}/${encodeURIComponent(lfpStoreSegment(idOrName))}`,
    );
  }

  /** Insert (upsert) a local inventory entry (`lfpInventories:insert`). */
  insertInventory(body: LfpInventoryInput): Promise<LfpInventory> {
    return this.client.request<LfpInventory>(
      "lfp",
      "POST",
      `${this.base("lfpInventories")}:insert`,
      { body },
    );
  }

  /** Submit a local sale event (`lfpSales:insert`). */
  insertSale(body: LfpSaleInput): Promise<LfpSale> {
    return this.client.request<LfpSale>("lfp", "POST", `${this.base("lfpSales")}:insert`, { body });
  }

  /** Fetch a merchant's LFP onboarding state by target-account id (or full resource name). */
  getMerchantState(idOrName: string): Promise<LfpMerchantState> {
    return this.client.get<LfpMerchantState>(
      "lfp",
      `${this.base("lfpMerchantStates")}/${encodeURIComponent(lfpMerchantStateSegment(idOrName))}`,
    );
  }
}
