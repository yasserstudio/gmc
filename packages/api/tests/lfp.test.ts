import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { LfpService, lfpStoreSegment, lfpMerchantStateSegment } from "../src/lfp.js";
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
): { service: LfpService; calls: { url: string; method?: string; body?: unknown }[] } {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    calls.push({
      url: u,
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return jsonResponse(status, body);
  }) as unknown as typeof fetch;
  // The path account is the LFP *provider*.
  const service = new LfpService(
    new MerchantClient({ auth, accountId: "777", fetchImpl, clock: instantClock }),
  );
  return { service, calls };
}

const BASE = "https://merchantapi.googleapis.com/lfp/v1/accounts/777";

describe("lfp segments", () => {
  it("reduce full resource names to bare ids", () => {
    expect(lfpStoreSegment("accounts/777/lfpStores/m1~s1")).toBe("m1~s1");
    expect(lfpStoreSegment("m1~s1")).toBe("m1~s1");
    expect(lfpMerchantStateSegment("accounts/777/lfpMerchantStates/123")).toBe("123");
  });
});

describe("LfpService", () => {
  it("lists a merchant's stores, sending targetAccount and following pagination", async () => {
    let call = 0;
    const pages = [
      { lfpStores: [{ name: "accounts/777/lfpStores/a" }], nextPageToken: "t2" },
      { lfpStores: [{ name: "accounts/777/lfpStores/b" }] },
    ];
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;
    const service = new LfpService(
      new MerchantClient({ auth, accountId: "777", fetchImpl, clock: instantClock }),
    );
    const list = await service.listStores("123");
    expect(list.map((s) => lfpStoreSegment(s.name ?? ""))).toEqual(["a", "b"]);
    expect(urls[0]).toContain(`${BASE}/lfpStores?`);
    expect(urls[0]).toContain("targetAccount=123");
    expect(urls[1]).toContain("pageToken=t2");
  });

  it("gets a store, normalizing a full resource name", async () => {
    const { service, calls } = capturing({ name: "accounts/777/lfpStores/m1~s1" });
    await service.getStore("accounts/777/lfpStores/m1~s1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${BASE}/lfpStores/m1~s1`);
  });

  it("inserts a store via lfpStores:insert with the body", async () => {
    const { service, calls } = capturing({ name: "accounts/777/lfpStores/m1~s1" });
    const input = { targetAccount: "123", storeCode: "s1", storeName: "Shop" };
    await service.insertStore(input);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/lfpStores:insert`);
    expect(calls[0]?.body).toEqual(input);
  });

  it("deletes a store by id", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteStore("m1~s1");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(`${BASE}/lfpStores/m1~s1`);
  });

  it("inserts inventory via lfpInventories:insert", async () => {
    const { service, calls } = capturing({ name: "accounts/777/lfpInventories/x" });
    const input = {
      targetAccount: "123",
      storeCode: "s1",
      offerId: "sku1",
      quantity: "5",
      price: { amountMicros: "1990000", currencyCode: "USD" },
    };
    await service.insertInventory(input);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/lfpInventories:insert`);
    expect(calls[0]?.body).toEqual(input);
  });

  it("inserts a sale via lfpSales:insert", async () => {
    const { service, calls } = capturing({ name: "accounts/777/lfpSales/x" });
    const input = {
      targetAccount: "123",
      storeCode: "s1",
      offerId: "sku1",
      quantity: "1",
      saleTime: "2026-06-14T00:00:00Z",
    };
    await service.insertSale(input);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/lfpSales:insert`);
    expect(calls[0]?.body).toEqual(input);
  });

  it("gets a merchant state by target-account id", async () => {
    const { service, calls } = capturing({ name: "accounts/777/lfpMerchantStates/123" });
    await service.getMerchantState("123");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${BASE}/lfpMerchantStates/123`);
  });
});
