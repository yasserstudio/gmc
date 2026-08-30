// Typed Products sub-API service (Merchant API `products/v1`). The API splits
// products in two: the read-only *processed* `products` resource (get/list, with
// status + item-level issues) and the writable `productInputs` resource
// (insert/update/delete). This service wraps a MerchantClient scoped to one account
// (it reads `client.accountResource`) and exposes both halves under one surface.

import type { MerchantClient } from "./client.js";

const PRODUCTS_API = "products/v1";

/** A monetary amount (google.shopping.type.Price). */
export interface Price {
  amountMicros?: string;
  currencyCode?: string;
}

/** Product-level order cutoff configuration (2026 product data specification). */
export interface HandlingCutoffTime {
  country?: string;
  cutoffTime?: string;
  cutoffTimezone?: string;
  disableDeliveryAfterCutoff?: boolean;
}

/** Minimum cart value before checkout is permitted for a country/service. */
export interface ProductMinimumOrderValue {
  country?: string;
  service?: string;
  surface?: "SURFACE_UNSPECIFIED" | "ONLINE" | "LOCAL" | "ONLINE_LOCAL";
  price?: Price;
}

/** Product-level in-store pickup cost added to the 2026 specification. */
export interface PickupCost {
  flatRate?: Price;
  freeThreshold?: Price;
}

/** Product-level shipping option (subset, including the 2026 loyalty fields). */
export interface Shipping {
  country?: string;
  region?: string;
  postalCode?: string;
  locationId?: string;
  locationGroupName?: string;
  service?: string;
  price?: Price;
  minHandlingTime?: string;
  maxHandlingTime?: string;
  minTransitTime?: string;
  maxTransitTime?: string;
  handlingCutoffTime?: string;
  handlingCutoffTimezone?: string;
  loyaltyProgramLabel?: string;
  loyaltyTierLabel?: string;
}

/** Offer-level return-policy override added to Products v1 in July 2026. */
export interface ProductReturns {
  countries?: string[];
  policyUrl?: string;
  windowType?:
    "RETURN_WINDOW_TYPE_UNSPECIFIED" | "FINITE_RETURN_WINDOW" | "NO_RETURNS" | "LIFETIME";
  windowDays?: string;
  itemConditions?: string[];
  methods?: string[];
  outcomes?: string[];
  shippingFeeType?: string;
  shippingFee?: Price;
  restockingFee?: Price;
  restockingPercentageFee?: number;
}

export interface QuestionAndAnswer {
  question?: string;
  answer?: string;
}

export interface RelatedProduct {
  id?: string;
  idType?: "ID_TYPE_UNSPECIFIED" | "GTIN" | "ID";
  relationshipType?: string;
}

export interface VariantOption {
  name?: string;
  value?: string;
}

// The interfaces below model only the fields the CLI reads; the Merchant API
// returns (and accepts) more. `client.get`/`request` round-trips the full JSON —
// these types are a compile-time view, not a runtime filter — so `--json` output
// and inserted product input are never lossy.

/** Product attributes (title, price, availability, ...). Subset. */
export interface ProductAttributes {
  title?: string;
  description?: string;
  link?: string;
  imageLink?: string;
  availability?: string;
  condition?: string;
  price?: Price;
  brand?: string;
  /** @deprecated Google replaced the singular field with `gtins`. */
  gtin?: string;
  gtins?: string[];
  mpn?: string;
  color?: string;
  size?: string;
  additionalImageLinks?: string[];
  videoLinks?: string[];
  returnPolicyLabel?: string;
  returns?: ProductReturns[];
  handlingCutoffTimes?: HandlingCutoffTime[];
  minimumOrderValues?: ProductMinimumOrderValue[];
  pickupCost?: PickupCost;
  shipping?: Shipping[];
  questionsAndAnswers?: QuestionAndAnswer[];
  documentLinks?: string[];
  relatedProducts?: RelatedProduct[];
  itemGroupTitle?: string;
  variantOptions?: VariantOption[];
  popularityRank?: number;
}

/** A custom (non-standard) product attribute. */
export interface CustomAttribute {
  name?: string;
  value?: string;
  groupValues?: CustomAttribute[];
}

/** A writable product input (`accounts/{account}/productInputs/{productInput}`). */
export interface ProductInput {
  name?: string;
  product?: string;
  /** Output-only encoded resource name, safe for identifiers containing `/`, `%`, or `~`. */
  base64EncodedName?: string;
  /** Output-only encoded processed-product name. */
  base64EncodedProduct?: string;
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  /** True for products sold exclusively in physical stores (Merchant API v1 replaced `channel` with this). */
  legacyLocal?: boolean;
  /** Freshness guard for inserts into primary data sources (int64 as a string). */
  versionNumber?: string;
  productAttributes?: ProductAttributes;
  customAttributes?: CustomAttribute[];
}

/** A single item-level issue from product processing (Merchant API v1). */
export interface ItemLevelIssue {
  code?: string;
  /** e.g. `ERROR`, `SUGGESTION`. v1 field (v1beta used `servability`). */
  severity?: string;
  resolution?: string;
  /** Destination/program the issue applies to (e.g. `SHOPPING_ADS`). v1 renamed `destination`. */
  reportingContext?: string;
  description?: string;
  detail?: string;
  documentation?: string;
  applicableCountries?: string[];
}

/** Processing status for a product. */
export interface ProductStatus {
  destinationStatuses?: unknown[];
  itemLevelIssues?: ItemLevelIssue[];
  creationDate?: string;
  lastUpdateDate?: string;
}

/** A processed, read-only product (`accounts/{account}/products/{product}`). */
export interface Product {
  name: string;
  /** Output-only encoded resource name, safe to pass back to get/delete/update calls. */
  base64EncodedName?: string;
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  legacyLocal?: boolean;
  dataSource?: string;
  productAttributes?: ProductAttributes;
  customAttributes?: CustomAttribute[];
  productStatus?: ProductStatus;
  versionNumber?: string;
  archived?: boolean;
}

/** One page of `products.list`. */
interface ProductsListPage {
  products?: Product[];
  nextPageToken?: string;
}

/**
 * Reduce a product id or full resource name to the composite product segment
 * (`{contentLanguage}~{feedLabel}~{offerId}`, with a `local~` prefix for
 * legacy-local products), so `get`/`delete` accept either a bare id or the `name`
 * returned by `list`.
 */
export function productSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/(?:products|productInputs)\//, "");
}

/**
 * Convert a product identifier to the path form required by Merchant API v1.
 * Plain composite ids are accepted when they contain exactly the structural `~`
 * separators. If an identity component itself contains `/`, `%`, or `~`, Google
 * requires the entire composite id to be unpadded base64url encoded.
 *
 * A segment with no `~` is treated as an already encoded id (for example the
 * `base64EncodedName` returned by Google) and passed through unchanged.
 */
export function productPathSegment(idOrName: string): string {
  const segment = productSegment(idOrName);
  if (!segment.includes("~")) return segment;

  const expectedParts = segment.startsWith("local~") ? 4 : 3;
  const mustEncode =
    segment.includes("/") || segment.includes("%") || segment.split("~").length !== expectedParts;
  return mustEncode ? Buffer.from(segment, "utf8").toString("base64url") : segment;
}

/**
 * Composite product identity — the `{contentLanguage}~{feedLabel}~{offerId}` key
 * Merchant Center, `gmc feeds`, and preflight all key products by, with a `local~`
 * prefix when the product is legacy-local (Merchant API v1 dropped the `channel`
 * segment for this scheme). Missing parts collapse to empty segments. Lives here,
 * next to the {@link ProductInput} it derives from, so every consumer shares one
 * definition.
 */
export function productKey(input: ProductInput): string {
  const core = [input.contentLanguage, input.feedLabel, input.offerId]
    .map((part) => part ?? "")
    .join("~");
  return input.legacyLocal ? `local~${core}` : core;
}

/**
 * Map a processed Product to a push-ready ProductInput. Intentional allowlist:
 * output-only data (`name`, `productStatus`, `dataSource`, …) can never leak into
 * a file that will later be pushed. `versionNumber`, `productAttributes`, and
 * `customAttributes` are kept by
 * reference — the caller must not mutate the result.
 */
export function toProductInput(product: Product): ProductInput {
  const input: ProductInput = {};
  if (product.offerId !== undefined) input.offerId = product.offerId;
  if (product.contentLanguage !== undefined) input.contentLanguage = product.contentLanguage;
  if (product.feedLabel !== undefined) input.feedLabel = product.feedLabel;
  if (product.legacyLocal !== undefined) input.legacyLocal = product.legacyLocal;
  if (product.versionNumber !== undefined) input.versionNumber = product.versionNumber;
  if (product.productAttributes !== undefined) input.productAttributes = product.productAttributes;
  if (product.customAttributes !== undefined) input.customAttributes = product.customAttributes;
  return input;
}

// Build the data source resource name (`accounts/{account}/dataSources/{id}`) for
// the `dataSource` query param. Accepts a bare id or a full name. NOT pre-encoded:
// the value is passed through URLSearchParams, which percent-encodes it once —
// encoding here too would double-encode a non-numeric id.
function dataSourceName(accountResource: string, dataSource: string): string {
  const id = dataSource.replace(/^.*dataSources\//, "");
  return `${accountResource}/dataSources/${id}`;
}

/** Read and write access to the Merchant API Products sub-API. */
export class ProductsService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${PRODUCTS_API}/${this.client.accountResource}`;
  }

  /** Fetch a single processed product (read-only; carries status + issues). */
  getProduct(productId: string): Promise<Product> {
    return this.client.get<Product>(
      "products",
      `${this.base}/products/${encodeURIComponent(productPathSegment(productId))}`,
    );
  }

  /** List every processed product for the account, following pagination. */
  async listProducts(opts: { pageSize?: number } = {}): Promise<Product[]> {
    const products: Product[] = [];
    for await (const product of this.client.paginate<Product>("products", `${this.base}/products`, {
      ...(opts.pageSize ? { query: { pageSize: opts.pageSize } } : {}),
      select: (page) => (page as ProductsListPage).products ?? [],
    })) {
      products.push(product);
    }
    return products;
  }

  /**
   * Insert (create or replace) a product input under the given data source.
   * Uses `client.request` directly (not `post`) to attach the required
   * `dataSource` query param. The data source is taken as a raw id or resource
   * name (create one with the datasources service / `gmc datasources create`).
   */
  insertProductInput(input: ProductInput, dataSource: string): Promise<ProductInput> {
    return this.client.request<ProductInput>(
      "products",
      "POST",
      `${this.base}/productInputs:insert`,
      {
        body: input,
        query: { dataSource: dataSourceName(this.client.accountResource, dataSource) },
      },
    );
  }

  /**
   * Patch selected attributes on an existing product input. Unlike `insert`, this
   * can update price/availability without resending every required product field.
   * The optional mask uses Product attributes (for example `price,availability`);
   * when omitted Google updates the populated fields in `input`.
   */
  updateProductInput(
    productId: string,
    input: ProductInput,
    dataSource: string,
    opts: { updateMask?: string } = {},
  ): Promise<ProductInput> {
    const segment = productPathSegment(productId);
    const body: ProductInput = {
      ...input,
      name: `${this.client.accountResource}/productInputs/${segment}`,
    };
    return this.client.request<ProductInput>(
      "products",
      "PATCH",
      `${this.base}/productInputs/${encodeURIComponent(segment)}`,
      {
        query: {
          dataSource: dataSourceName(this.client.accountResource, dataSource),
          ...(opts.updateMask ? { updateMask: opts.updateMask } : {}),
        },
        body,
      },
    );
  }

  /**
   * Delete a product input from the given data source. Uses `client.request`
   * directly (not `delete`) to attach the required `dataSource` query param.
   */
  async deleteProductInput(productId: string, dataSource: string): Promise<void> {
    await this.client.request<undefined>(
      "products",
      "DELETE",
      `${this.base}/productInputs/${encodeURIComponent(productPathSegment(productId))}`,
      { query: { dataSource: dataSourceName(this.client.accountResource, dataSource) } },
    );
  }
}
