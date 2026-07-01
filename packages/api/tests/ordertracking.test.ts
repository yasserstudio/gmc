import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { OrderTrackingService } from "../src/ordertracking.js";
import type { OrderTrackingSignalInput } from "../src/ordertracking.js";
import type { Clock } from "../src/rate-limiter.js";

const auth = {
  getAccessToken: async () => "tok",
  getClientEmail: () => "e",
  getProjectId: () => undefined,
};
const instantClock: Clock = { now: () => 0, sleep: async () => {} };

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function capturing(
  body: unknown,
  status = 200,
): {
  service: OrderTrackingService;
  calls: { url: string; method?: string; body?: unknown }[];
} {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    calls.push({
      url: u,
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return jsonResponse(status, body);
  }) as unknown as typeof fetch;
  const service = new OrderTrackingService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
  return { service, calls };
}

const BASE =
  "https://merchantapi.googleapis.com/ordertracking/v1/accounts/123/orderTrackingSignals";

// A realistic signal in the exact wire shape the ordertracking/v1 proto defines —
// guards against silent field-name/path drift (the products v1 lesson).
const SIGNAL: OrderTrackingSignalInput = {
  orderCreatedTime: { year: 2026, month: 6, day: 30, timeZone: { id: "America/Los_Angeles" } },
  orderId: "order-abc",
  shippingInfo: [
    {
      shipmentId: "ship-1",
      trackingId: "1Z999",
      carrier: "UPS",
      shippingStatus: "SHIPPED",
      originPostalCode: "95016",
      originRegionCode: "US",
    },
  ],
  lineItems: [{ lineItemId: "li-1", productId: "online:en:US:sku1", quantity: "2" }],
};

describe("OrderTrackingService", () => {
  it("creates a signal by POSTing the body to orderTrackingSignals", async () => {
    const { service, calls } = capturing({ ...SIGNAL, orderTrackingSignalId: "999" });
    const result = await service.createOrderTrackingSignal(SIGNAL);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(BASE);
    // The request body is the signal itself (body: "order_tracking_signal"), verbatim.
    expect(calls[0]?.body).toEqual(SIGNAL);
    expect(result.orderTrackingSignalId).toBe("999");
  });
});
