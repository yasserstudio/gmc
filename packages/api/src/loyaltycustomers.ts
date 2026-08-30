// Typed Loyalty Customers sub-API service (Merchant API `loyaltyCustomers/v1`).
// The API intentionally exposes one imperative manage operation and no get/list
// methods, preventing customer membership discovery. Runs on its own rate bucket.

import type { MerchantClient } from "./client.js";

const LOYALTY_CUSTOMERS_API = "loyaltyCustomers/v1";

/** A customer's physical address used as one possible match identifier. */
export interface AddressInfo {
  givenName?: string;
  familyName?: string;
  city?: string;
  state?: string;
  regionCode?: string;
  postalCode?: string;
}

/** Customer match inputs. At least one identifier is required. */
export interface UserIdentifier {
  emailAddress?: string;
  phoneNumber?: string;
  address?: AddressInfo;
}

export type LoyaltyTier =
  | "LOYALTY_TIER_UNSPECIFIED"
  | "TIER1"
  | "TIER2"
  | "TIER3"
  | "TIER4"
  | "TIER5"
  | "TIER6"
  | "TIER7"
  | "NON_MEMBER";

/** Customer loyalty membership sent to the privacy-preserving manage method. */
export interface LoyaltyCustomer {
  userIdentifier?: UserIdentifier;
  loyaltyTier?: LoyaltyTier;
  /** Optional int64-as-string points balance. */
  pointBalance?: string;
}

export interface ManageLoyaltyCustomerMatchRequest {
  loyaltyCustomer?: LoyaltyCustomer;
}

export interface ManageLoyaltyCustomerMatchResponse {
  loyaltyCustomer?: LoyaltyCustomer;
}

/** Write-only association management for loyalty customers. */
export class LoyaltyCustomersService {
  constructor(private readonly client: MerchantClient) {}

  manage(request: ManageLoyaltyCustomerMatchRequest): Promise<ManageLoyaltyCustomerMatchResponse> {
    return this.client.post<ManageLoyaltyCustomerMatchResponse>(
      "loyaltycustomers",
      `${LOYALTY_CUSTOMERS_API}/${this.client.accountResource}/loyaltyCustomers:manage`,
      request,
    );
  }
}
