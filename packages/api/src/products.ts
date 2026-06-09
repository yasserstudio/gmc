// Typed Products sub-API service (Merchant API `products/v1beta`). The API splits
// products in two: the read-only *processed* `products` resource (get/list, with
// status + item-level issues) and the writable `productInputs` resource
// (insert/delete only). This service wraps a MerchantClient scoped to one account
// (it reads `client.accountResource`) and exposes both halves under one surface.

import type { MerchantClient } from "./client.js";

const PRODUCTS_API = "products/v1beta";

/** A monetary amount (google.shopping.type.Price). */
export interface Price {
  amountMicros?: string;
  currencyCode?: string;
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
  gtin?: string;
  mpn?: string;
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
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  channel?: string;
  attributes?: ProductAttributes;
  customAttributes?: CustomAttribute[];
}

/** A single item-level issue from product processing. */
export interface ItemLevelIssue {
  code?: string;
  servability?: string;
  resolution?: string;
  attribute?: string;
  destination?: string;
  description?: string;
  detail?: string;
  documentation?: string;
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
  channel?: string;
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  dataSource?: string;
  attributes?: ProductAttributes;
  customAttributes?: CustomAttribute[];
  productStatus?: ProductStatus;
}

/** One page of `products.list`. */
interface ProductsListPage {
  products?: Product[];
  nextPageToken?: string;
}

/**
 * Reduce a product id or full resource name to the composite product segment
 * (`{channel}~{contentLanguage}~{feedLabel}~{offerId}`), so `get`/`delete` accept
 * either a bare id or the `name` returned by `list`.
 */
export function productSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/(?:products|productInputs)\//, "");
}

/**
 * Composite product identity — the `{channel}~{contentLanguage}~{feedLabel}~{offerId}`
 * key Merchant Center, `gmc feeds`, and preflight all key products by. Missing parts
 * collapse to empty segments. Lives here, next to the {@link ProductInput} it derives
 * from, so every consumer shares one definition.
 */
export function productKey(input: ProductInput): string {
  return [input.channel, input.contentLanguage, input.feedLabel, input.offerId]
    .map((part) => part ?? "")
    .join("~");
}

/**
 * Map a processed Product to a push-ready ProductInput. Intentional allowlist:
 * output-only data (`name`, `productStatus`, `dataSource`, …) can never leak into
 * a file that will later be pushed, at the cost of dropping edge writable fields
 * (e.g. `versionNumber`). `attributes`/`customAttributes` are kept by reference —
 * the caller must not mutate the result.
 */
export function toProductInput(product: Product): ProductInput {
  const input: ProductInput = {};
  if (product.offerId !== undefined) input.offerId = product.offerId;
  if (product.contentLanguage !== undefined) input.contentLanguage = product.contentLanguage;
  if (product.feedLabel !== undefined) input.feedLabel = product.feedLabel;
  if (product.channel !== undefined) input.channel = product.channel;
  if (product.attributes !== undefined) input.attributes = product.attributes;
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
      `${this.base}/products/${encodeURIComponent(productSegment(productId))}`,
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
    return this.client.request<ProductInput>("products", "POST", `${this.base}/productInputs:insert`, {
      body: input,
      query: { dataSource: dataSourceName(this.client.accountResource, dataSource) },
    });
  }

  /**
   * Delete a product input from the given data source. Uses `client.request`
   * directly (not `delete`) to attach the required `dataSource` query param.
   */
  async deleteProductInput(productId: string, dataSource: string): Promise<void> {
    await this.client.request<undefined>(
      "products",
      "DELETE",
      `${this.base}/productInputs/${encodeURIComponent(productSegment(productId))}`,
      { query: { dataSource: dataSourceName(this.client.accountResource, dataSource) } },
    );
  }
}
