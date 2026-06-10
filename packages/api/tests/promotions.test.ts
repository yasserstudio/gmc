import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { PromotionsService, promotionSegment } from "../src/promotions.js";
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

function capturing(body: unknown): {
  service: PromotionsService;
  calls: { url: string; method?: string; body?: unknown }[];
} {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    calls.push({
      url: u,
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return jsonResponse(200, body);
  }) as unknown as typeof fetch;
  const service = new PromotionsService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
  return { service, calls };
}

const BASE = "https://merchantapi.googleapis.com/promotions/v1/accounts/123/promotions";

describe("promotionSegment", () => {
  it("reduces a full resource name to its id", () => {
    expect(promotionSegment("accounts/123/promotions/PROMO1")).toBe("PROMO1");
    expect(promotionSegment("PROMO1")).toBe("PROMO1");
  });
});

describe("PromotionsService", () => {
  it("gets a promotion, normalizing a full resource name", async () => {
    const { service, calls } = capturing({ promotionId: "PROMO1" });
    const p = await service.getPromotion("accounts/123/promotions/PROMO1");
    expect(p.promotionId).toBe("PROMO1");
    expect(calls[0]?.url).toBe(`${BASE}/PROMO1`);
  });

  it("lists promotions with pageSize and pagination", async () => {
    let call = 0;
    const pages = [
      { promotions: [{ promotionId: "A" }], nextPageToken: "t2" },
      { promotions: [{ promotionId: "B" }] },
    ];
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;
    const service = new PromotionsService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );
    const list = await service.listPromotions({ pageSize: 50 });
    expect(list.map((p) => p.promotionId)).toEqual(["A", "B"]);
    expect(urls[0]).toContain("pageSize=50");
  });

  it("inserts a promotion with {promotion, dataSource} in the body (not a query param)", async () => {
    const { service, calls } = capturing({ promotionId: "PROMO1" });
    await service.insertPromotion({ promotionId: "PROMO1", contentLanguage: "en" }, "DS1");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}:insert`); // no query string
    expect(calls[0]?.body).toEqual({
      promotion: { promotionId: "PROMO1", contentLanguage: "en" },
      dataSource: "accounts/123/dataSources/DS1",
    });
  });

  it("accepts a full data source resource name on insert", async () => {
    const { service, calls } = capturing({});
    await service.insertPromotion({ promotionId: "P" }, "accounts/123/dataSources/DS9");
    expect((calls[0]?.body as { dataSource: string }).dataSource).toBe(
      "accounts/123/dataSources/DS9",
    );
  });
});
