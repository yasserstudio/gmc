// Typed Inventories sub-API service (Merchant API `inventories/v1beta`). Local and
// regional inventories are sub-resources of a product — per-store and per-region
// overrides of its price/availability. Each supports list / insert (upsert) /
// delete only (no get/patch; insert replaces by storeCode / region). This service
// wraps a MerchantClient scoped to one account (reads `client.accountResource`)
// and runs on the "inventories" rate-limit bucket. Mirrors ProductsService.

import type { MerchantClient } from "./client.js";
import { productSegment } from "./products.js";
import type { CustomAttribute, Price } from "./products.js";

const INVENTORIES_API = "inventories/v1beta";

// Like the other services, these model only the fields the CLI reads/writes; the
// Merchant API accepts and returns more, and `client.post`/`paginate` round-trip
// the full JSON, so `--json` output and inserted bodies are never lossy.

/** A start/end window for a sale price (google.type interval, subset). */
export interface TimePeriod {
  startTime?: string;
  endTime?: string;
}

/** A per-store override of a product (`.../localInventories/{storeCode}`). */
export interface LocalInventory {
  name?: string;
  account?: string;
  /** Local store code (required on insert); the resource id. */
  storeCode?: string;
  price?: Price;
  salePrice?: Price;
  salePriceEffectiveDate?: TimePeriod;
  availability?: string;
  /** Stock at this store (int64 as a string). */
  quantity?: string;
  pickupMethod?: string;
  pickupSla?: string;
  instoreProductLocation?: string;
  customAttributes?: CustomAttribute[];
}

/** A per-region override of a product (`.../regionalInventories/{region}`). */
export interface RegionalInventory {
  name?: string;
  account?: string;
  /** Region id (required on insert); the resource id. Must be defined for the account. */
  region?: string;
  price?: Price;
  salePrice?: Price;
  salePriceEffectiveDate?: TimePeriod;
  availability?: string;
  customAttributes?: CustomAttribute[];
}

/** One page of `localInventories.list`. */
interface LocalInventoriesListPage {
  localInventories?: LocalInventory[];
  nextPageToken?: string;
}

/** One page of `regionalInventories.list`. */
interface RegionalInventoriesListPage {
  regionalInventories?: RegionalInventory[];
  nextPageToken?: string;
}

/** Read and write access to the Merchant API Inventories sub-API. */
export class InventoriesService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${INVENTORIES_API}/${this.client.accountResource}`;
  }

  // The product these inventories hang off — accepts a bare id or a full resource name.
  private productBase(productId: string): string {
    return `${this.base}/products/${encodeURIComponent(productSegment(productId))}`;
  }

  /** List every local (per-store) inventory for a product, following pagination. */
  async listLocal(productId: string): Promise<LocalInventory[]> {
    const items: LocalInventory[] = [];
    for await (const li of this.client.paginate<LocalInventory>(
      "inventories",
      `${this.productBase(productId)}/localInventories`,
      { select: (page) => (page as LocalInventoriesListPage).localInventories ?? [] },
    )) {
      items.push(li);
    }
    return items;
  }

  /** Insert (create or replace) a local inventory by its `storeCode`. */
  insertLocal(productId: string, input: LocalInventory): Promise<LocalInventory> {
    return this.client.post<LocalInventory>(
      "inventories",
      `${this.productBase(productId)}/localInventories:insert`,
      input,
    );
  }

  /** Delete a local inventory by store code. */
  async deleteLocal(productId: string, storeCode: string): Promise<void> {
    await this.client.delete<undefined>(
      "inventories",
      `${this.productBase(productId)}/localInventories/${encodeURIComponent(storeCode)}`,
    );
  }

  /** List every regional (per-region) inventory for a product, following pagination. */
  async listRegional(productId: string): Promise<RegionalInventory[]> {
    const items: RegionalInventory[] = [];
    for await (const ri of this.client.paginate<RegionalInventory>(
      "inventories",
      `${this.productBase(productId)}/regionalInventories`,
      { select: (page) => (page as RegionalInventoriesListPage).regionalInventories ?? [] },
    )) {
      items.push(ri);
    }
    return items;
  }

  /** Insert (create or replace) a regional inventory by its `region`. */
  insertRegional(productId: string, input: RegionalInventory): Promise<RegionalInventory> {
    return this.client.post<RegionalInventory>(
      "inventories",
      `${this.productBase(productId)}/regionalInventories:insert`,
      input,
    );
  }

  /** Delete a regional inventory by region id. */
  async deleteRegional(productId: string, region: string): Promise<void> {
    await this.client.delete<undefined>(
      "inventories",
      `${this.productBase(productId)}/regionalInventories/${encodeURIComponent(region)}`,
    );
  }
}
