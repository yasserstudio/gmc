// Typed Order Tracking sub-API service (Merchant API `ordertracking/v1`,
// `accounts.orderTrackingSignals`). An order tracking signal reports a completed
// shipment so Google can show accurate delivery estimates. The sub-API is
// write-only: the single method is `create` (no get/list/update/delete) — signals
// can be created but never modified, and a business submits one only once an order
// is completely shipped. `create` returns the signal with its output-only
// `orderTrackingSignalId` (and order/shipment ids hashed). Wraps a MerchantClient
// scoped to one account; runs on the "ordertracking" rate-limit bucket.

import type { MerchantClient } from "./client.js";
import type { Price } from "./products.js";

const ORDERTRACKING_API = "ordertracking/v1";

// As elsewhere, these model only the fields the CLI reads/writes; the Merchant API
// accepts and returns more, and `client.post` round-trips the full JSON, so `--json`
// output and the body sent on create are never lossy.

/** A `google.type.DateTime` (subset). The API wants year + timezone where available. */
export interface DateTime {
  year?: number;
  month?: number;
  day?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  nanos?: number;
  utcOffset?: string;
  timeZone?: { id?: string; version?: string };
}

/** `SHIPPING_STATE_UNSPECIFIED` | `SHIPPED` | `DELIVERED`. */
export type ShippingState = string;

/** Shipping information for one shipment within an order. */
export interface ShippingInfo {
  /** Required. The shipment id (hashed in the create response). */
  shipmentId?: string;
  /** Tracking id; required unless a delivery-promise/actual-delivery time is given. */
  trackingId?: string;
  /** Carrier name; required unless a delivery-promise/actual-delivery time is given. */
  carrier?: string;
  /** Service type, e.g. `GROUND`, `FIRST_CLASS`. */
  carrierService?: string;
  shippedTime?: DateTime;
  earliestDeliveryPromiseTime?: DateTime;
  latestDeliveryPromiseTime?: DateTime;
  actualDeliveryTime?: DateTime;
  /** Required. `SHIPPED` or `DELIVERED`. */
  shippingStatus?: ShippingState;
  /** Required. Origin postal code (anonymized in the response). */
  originPostalCode?: string;
  /** Required. CLDR territory code of the shipping origin. */
  originRegionCode?: string;
}

/** One line item of the order. */
export interface LineItemDetails {
  /** Required. The line item id. */
  lineItemId?: string;
  /** Required. Content API REST id: `channel:contentLanguage:targetCountry:offerId`. */
  productId?: string;
  gtins?: string[];
  mpn?: string;
  productTitle?: string;
  brand?: string;
  /** Required. Quantity of this line item in the order. */
  quantity?: string | number;
}

/** How many of a line item are in a given shipment. */
export interface ShipmentLineItemMapping {
  shipmentId?: string;
  lineItemId?: string;
  quantity?: string | number;
}

/**
 * An order tracking signal (`accounts/{account}/orderTrackingSignals/{id}`). The
 * order and shipment ids are hashed, and postal codes anonymized, in the value the
 * API returns from `create`.
 */
export interface OrderTrackingSignal {
  /** Output-only. The id that uniquely identifies this signal. */
  orderTrackingSignalId?: string;
  /** The Merchant Center id; defaults to the caller's account when unset. */
  merchantId?: string;
  /** Required. When the order was created on the business's side. */
  orderCreatedTime?: DateTime;
  /** Required. The order id on the business's side (hashed in the response). */
  orderId?: string;
  /** Required. Shipping information for the order. */
  shippingInfo?: ShippingInfo[];
  /** Required. The line items in the order. */
  lineItems?: LineItemDetails[];
  shipmentLineItemMapping?: ShipmentLineItemMapping[];
  /** Shipping fee; set to zero for free shipping. */
  customerShippingFee?: Price;
  deliveryPostalCode?: string;
  deliveryRegionCode?: string;
}

/** The writable subset accepted on create — every field except the output-only id. */
export type OrderTrackingSignalInput = Omit<OrderTrackingSignal, "orderTrackingSignalId">;

/** Create-only access to the Merchant API Order Tracking sub-API. */
export class OrderTrackingService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${ORDERTRACKING_API}/${this.client.accountResource}/orderTrackingSignals`;
  }

  /**
   * Create an order tracking signal. The request body is the signal itself
   * (`body: "order_tracking_signal"`); the id is server-assigned. Returns the
   * created signal with its `orderTrackingSignalId` set. There is no update or
   * delete — a signal is immutable once created.
   */
  createOrderTrackingSignal(signal: OrderTrackingSignalInput): Promise<OrderTrackingSignal> {
    return this.client.post<OrderTrackingSignal>("ordertracking", this.base, signal);
  }
}
