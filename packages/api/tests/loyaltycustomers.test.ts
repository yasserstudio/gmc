import { describe, expect, it } from "vitest";
import { MerchantClient } from "../src/client.js";
import {
  LoyaltyCustomersService,
  type ManageLoyaltyCustomerMatchRequest,
} from "../src/loyaltycustomers.js";
import type { Clock } from "../src/rate-limiter.js";

const auth = {
  getAccessToken: async () => "tok",
  getClientEmail: () => "e",
  getProjectId: () => undefined,
};
const instantClock: Clock = { now: () => 0, sleep: async () => {} };

describe("LoyaltyCustomersService", () => {
  it("posts the exact manage request to loyaltyCustomers/v1", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const fetchImpl = (async (requestUrl: string, requestInit?: RequestInit) => {
      url = requestUrl;
      init = requestInit;
      return new Response(JSON.stringify({ loyaltyCustomer: { loyaltyTier: "TIER2" } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const service = new LoyaltyCustomersService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );
    const request: ManageLoyaltyCustomerMatchRequest = {
      loyaltyCustomer: {
        userIdentifier: { emailAddress: "member@example.com" },
        loyaltyTier: "TIER2",
        pointBalance: "750",
      },
    };

    const response = await service.manage(request);

    expect(init?.method).toBe("POST");
    expect(url).toBe(
      "https://merchantapi.googleapis.com/loyaltyCustomers/v1/accounts/123/loyaltyCustomers:manage",
    );
    expect(JSON.parse(init?.body as string)).toEqual(request);
    expect(response.loyaltyCustomer?.loyaltyTier).toBe("TIER2");
  });
});
