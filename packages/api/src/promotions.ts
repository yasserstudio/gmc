// Typed Promotions sub-API service (Merchant API `promotions/v1`). A promotion
// is a discount/offer applied to products (e.g. "20% off", "free shipping"). Like
// products, a promotion is inserted under a (promotion) data source and is then
// processed; the API exposes insert (create/replace) plus get/list — there is no
// delete (promotions expire). Wraps a MerchantClient scoped to one account and
// runs on the "promotions" rate-limit bucket. Mirrors ProductsService.

import type { MerchantClient } from "./client.js";
import type { CustomAttribute, Price } from "./products.js";

const PROMOTIONS_API = "promotions/v1";

// As elsewhere, these model only the fields the CLI reads; the Merchant API accepts
// and returns more, and the full JSON round-trips through `client.get`/`request`.

/** A start/end window (google.type interval, subset). */
export interface TimePeriod {
  startTime?: string;
  endTime?: string;
}

/** Promotion attributes (the offer's terms). Subset. */
export interface PromotionAttributes {
  productApplicability?: string;
  offerType?: string;
  longTitle?: string;
  couponValueType?: string;
  promotionEffectiveTimePeriod?: TimePeriod;
  promotionDisplayTimePeriod?: TimePeriod;
  percentOff?: string;
  moneyOffAmount?: Price;
  genericRedemptionCode?: string;
}

/** A promotion (`accounts/{account}/promotions/{promotion}`). */
export interface Promotion {
  name?: string;
  /** Merchant-supplied promotion id (required on insert). */
  promotionId?: string;
  contentLanguage?: string;
  targetCountry?: string;
  redemptionChannel?: string[];
  dataSource?: string;
  attributes?: PromotionAttributes;
  customAttributes?: CustomAttribute[];
  promotionStatus?: unknown;
}

/** One page of `promotions.list`. */
interface PromotionsListPage {
  promotions?: Promotion[];
  nextPageToken?: string;
}

/**
 * Reduce a promotion id or full resource name to its bare id, so `get` accepts
 * either a bare id or the `name` returned by `list`.
 */
export function promotionSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/promotions\//, "");
}

// Build the data source resource name (`accounts/{account}/dataSources/{id}`) for
// the `dataSource` body field. Accepts a bare id or a full resource name.
function dataSourceName(accountResource: string, dataSource: string): string {
  const id = dataSource.replace(/^.*dataSources\//, "");
  return `${accountResource}/dataSources/${id}`;
}

/** Read and write access to the Merchant API Promotions sub-API. */
export class PromotionsService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${PROMOTIONS_API}/${this.client.accountResource}`;
  }

  /** Fetch a single promotion. */
  getPromotion(promotionId: string): Promise<Promotion> {
    return this.client.get<Promotion>(
      "promotions",
      `${this.base}/promotions/${encodeURIComponent(promotionSegment(promotionId))}`,
    );
  }

  /** List every promotion for the account, following pagination. */
  async listPromotions(opts: { pageSize?: number } = {}): Promise<Promotion[]> {
    const promotions: Promotion[] = [];
    for await (const p of this.client.paginate<Promotion>("promotions", `${this.base}/promotions`, {
      ...(opts.pageSize ? { query: { pageSize: opts.pageSize } } : {}),
      select: (page) => (page as PromotionsListPage).promotions ?? [],
    })) {
      promotions.push(p);
    }
    return promotions;
  }

  /**
   * Insert (create or replace) a promotion under the given data source. Unlike
   * `productInputs:insert` (dataSource is a query param), the promotions API takes
   * an `InsertPromotionRequest` body of `{ promotion, dataSource }` — both required.
   * Create the data source with `gmc datasources create`.
   */
  insertPromotion(input: Promotion, dataSource: string): Promise<Promotion> {
    return this.client.post<Promotion>("promotions", `${this.base}/promotions:insert`, {
      promotion: input,
      dataSource: dataSourceName(this.client.accountResource, dataSource),
    });
  }
}
