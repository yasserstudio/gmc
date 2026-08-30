// Typed Inventories sub-API service (Merchant API `inventories/v1`). Local and
// regional inventories are sub-resources of a product — per-store and per-region
// overrides of its price/availability. Each supports list / insert (upsert) /
// delete only (no get/patch; insert replaces by storeCode / region). This service
// wraps a MerchantClient scoped to one account (reads `client.accountResource`)
// and runs on the "inventories" rate-limit bucket. Mirrors ProductsService.

import type { MerchantClient } from "./client.js";
import { productPathSegment } from "./products.js";
import type { CustomAttribute, Price } from "./products.js";

const INVENTORIES_API = "inventories/v1";

// Like the other services, these model only the fields the CLI reads/writes; the
// Merchant API accepts and returns more, and `client.post`/`paginate` round-trip
// the full JSON, so `--json` output and inserted bodies are never lossy.

/** A start/end window for a sale price (google.type interval, subset). */
export interface TimePeriod {
  startTime?: string;
  endTime?: string;
}

/** Member benefit attached to one store/region inventory entry. */
export interface InventoryLoyaltyProgram {
  programLabel?: string;
  tierLabel?: string;
  price?: Price;
  memberPriceEffectiveInterval?: TimePeriod;
  loyaltyPoints?: string;
  cashbackForFutureUse?: Price;
  shippingLabel?: string;
}

export interface LocalInventoryAttributes {
  price?: Price;
  salePrice?: Price;
  salePriceEffectiveDate?: TimePeriod;
  loyaltyPrograms?: InventoryLoyaltyProgram[];
  customAttributes?: CustomAttribute[];
  availability?: string;
  /** Stock at this store (int64 as a string). */
  quantity?: string;
  pickupMethod?: string;
  pickupSla?: string;
  instoreProductLocation?: string;
  localShippingLabel?: string;
}

export interface RegionalInventoryAttributes {
  price?: Price;
  salePrice?: Price;
  salePriceEffectiveDate?: TimePeriod;
  loyaltyPrograms?: InventoryLoyaltyProgram[];
  availability?: string;
}

/** A per-store override of a product (`.../localInventories/{storeCode}`). */
export interface LocalInventory {
  name?: string;
  base64EncodedName?: string;
  account?: string;
  /** Local store code (required on insert); the resource id. */
  storeCode?: string;
  localInventoryAttributes?: LocalInventoryAttributes;
  /** @deprecated Use `localInventoryAttributes.price`; accepted on writes for compatibility. */
  price?: Price;
  /** @deprecated Use `localInventoryAttributes.salePrice`. */
  salePrice?: Price;
  /** @deprecated Use `localInventoryAttributes.salePriceEffectiveDate`. */
  salePriceEffectiveDate?: TimePeriod;
  /** @deprecated Use `localInventoryAttributes.availability`. */
  availability?: string;
  /** @deprecated Use `localInventoryAttributes.quantity`. */
  quantity?: string;
  /** @deprecated Use `localInventoryAttributes.pickupMethod`. */
  pickupMethod?: string;
  /** @deprecated Use `localInventoryAttributes.pickupSla`. */
  pickupSla?: string;
  /** @deprecated Use `localInventoryAttributes.instoreProductLocation`. */
  instoreProductLocation?: string;
  /** @deprecated Use `localInventoryAttributes.localShippingLabel`. */
  localShippingLabel?: string;
  /** @deprecated Use `localInventoryAttributes.loyaltyPrograms`. */
  loyaltyPrograms?: InventoryLoyaltyProgram[];
  /** @deprecated Use `localInventoryAttributes.customAttributes`. */
  customAttributes?: CustomAttribute[];
}

/** A per-region override of a product (`.../regionalInventories/{region}`). */
export interface RegionalInventory {
  name?: string;
  base64EncodedName?: string;
  account?: string;
  /** Region id (required on insert); the resource id. Must be defined for the account. */
  region?: string;
  regionalInventoryAttributes?: RegionalInventoryAttributes;
  /** @deprecated Use `regionalInventoryAttributes.price`; accepted on writes for compatibility. */
  price?: Price;
  /** @deprecated Use `regionalInventoryAttributes.salePrice`. */
  salePrice?: Price;
  /** @deprecated Use `regionalInventoryAttributes.salePriceEffectiveDate`. */
  salePriceEffectiveDate?: TimePeriod;
  /** @deprecated Use `regionalInventoryAttributes.availability`. */
  availability?: string;
  /** @deprecated Use `regionalInventoryAttributes.loyaltyPrograms`. */
  loyaltyPrograms?: InventoryLoyaltyProgram[];
}

function enumValue(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase().replace(/[ -]+/g, "_");
}

function localAvailability(value: string | undefined): string | undefined {
  return enumValue(value);
}

function regionalAvailability(value: string | undefined): string | undefined {
  return enumValue(value);
}

function pickupMethod(value: string | undefined): string | undefined {
  const normalized = enumValue(value);
  return normalized === "SHIP" ? "SHIP_TO_STORE" : normalized;
}

function pickupSla(value: string | undefined): string | undefined {
  const normalized = enumValue(value);
  const legacy: Record<string, string> = {
    "2_DAY": "TWO_DAY",
    "3_DAY": "THREE_DAY",
    "4_DAY": "FOUR_DAY",
    "5_DAY": "FIVE_DAY",
    "6_DAY": "SIX_DAY",
    "7_DAY": "SEVEN_DAY",
  };
  return normalized ? (legacy[normalized] ?? normalized) : undefined;
}

function normalizeLocalAttributes(attributes: LocalInventoryAttributes): LocalInventoryAttributes {
  return {
    ...attributes,
    ...(attributes.availability !== undefined
      ? { availability: localAvailability(attributes.availability) }
      : {}),
    ...(attributes.pickupMethod !== undefined
      ? { pickupMethod: pickupMethod(attributes.pickupMethod) }
      : {}),
    ...(attributes.pickupSla !== undefined ? { pickupSla: pickupSla(attributes.pickupSla) } : {}),
  };
}

function normalizeRegionalAttributes(
  attributes: RegionalInventoryAttributes,
): RegionalInventoryAttributes {
  return {
    ...attributes,
    ...(attributes.availability !== undefined
      ? { availability: regionalAvailability(attributes.availability) }
      : {}),
  };
}

/** Convert GMC's pre-1.1 flattened inventory input to Google's current v1 wire shape. */
export function normalizeLocalInventory(input: LocalInventory): LocalInventory {
  const legacy: LocalInventoryAttributes = {
    ...(input.price !== undefined ? { price: input.price } : {}),
    ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
    ...(input.salePriceEffectiveDate !== undefined
      ? { salePriceEffectiveDate: input.salePriceEffectiveDate }
      : {}),
    ...(input.loyaltyPrograms !== undefined ? { loyaltyPrograms: input.loyaltyPrograms } : {}),
    ...(input.customAttributes !== undefined ? { customAttributes: input.customAttributes } : {}),
    ...(input.availability !== undefined ? { availability: input.availability } : {}),
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
    ...(input.pickupMethod !== undefined ? { pickupMethod: input.pickupMethod } : {}),
    ...(input.pickupSla !== undefined ? { pickupSla: input.pickupSla } : {}),
    ...(input.instoreProductLocation !== undefined
      ? { instoreProductLocation: input.instoreProductLocation }
      : {}),
    ...(input.localShippingLabel !== undefined
      ? { localShippingLabel: input.localShippingLabel }
      : {}),
  };
  const attributes = normalizeLocalAttributes({ ...legacy, ...input.localInventoryAttributes });
  return {
    ...(input.storeCode !== undefined ? { storeCode: input.storeCode } : {}),
    ...(Object.keys(attributes).length > 0 ? { localInventoryAttributes: attributes } : {}),
  };
}

/** Convert GMC's pre-1.1 flattened regional input to Google's current v1 wire shape. */
export function normalizeRegionalInventory(input: RegionalInventory): RegionalInventory {
  const legacy: RegionalInventoryAttributes = {
    ...(input.price !== undefined ? { price: input.price } : {}),
    ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
    ...(input.salePriceEffectiveDate !== undefined
      ? { salePriceEffectiveDate: input.salePriceEffectiveDate }
      : {}),
    ...(input.loyaltyPrograms !== undefined ? { loyaltyPrograms: input.loyaltyPrograms } : {}),
    ...(input.availability !== undefined ? { availability: input.availability } : {}),
  };
  const attributes = normalizeRegionalAttributes({
    ...legacy,
    ...input.regionalInventoryAttributes,
  });
  return {
    ...(input.region !== undefined ? { region: input.region } : {}),
    ...(Object.keys(attributes).length > 0 ? { regionalInventoryAttributes: attributes } : {}),
  };
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
    return `${this.base}/products/${encodeURIComponent(productPathSegment(productId))}`;
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
      normalizeLocalInventory(input),
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
      normalizeRegionalInventory(input),
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
