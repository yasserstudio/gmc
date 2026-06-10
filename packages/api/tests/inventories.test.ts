import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { InventoriesService } from "../src/inventories.js";
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

interface Captured {
  url: string;
  method?: string;
  body?: unknown;
}

/** A service whose fetch captures the request, returning `body` for every call. */
function capturing(body: unknown, status = 200): { service: InventoriesService; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    calls.push({
      url: u,
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return jsonResponse(status, body);
  }) as unknown as typeof fetch;
  const service = new InventoriesService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
  return { service, calls };
}

const BASE = "https://merchantapi.googleapis.com/inventories/v1/accounts/123/products";

describe("InventoriesService — local", () => {
  it("lists local inventories at the product sub-resource path", async () => {
    const { service, calls } = capturing({ localInventories: [{ storeCode: "S1" }, { storeCode: "S2" }] });
    const items = await service.listLocal("online~en~US~SKU1");
    expect(items.map((i) => i.storeCode)).toEqual(["S1", "S2"]);
    expect(calls[0]?.url).toBe(`${BASE}/online~en~US~SKU1/localInventories`);
  });

  it("follows pagination", async () => {
    let call = 0;
    const pages = [
      { localInventories: [{ storeCode: "S1" }], nextPageToken: "t2" },
      { localInventories: [{ storeCode: "S2" }] },
    ];
    const fetchImpl = (async () => jsonResponse(200, pages[call++])) as unknown as typeof fetch;
    const service = new InventoriesService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );
    const items = await service.listLocal("p");
    expect(items).toHaveLength(2);
  });

  it("inserts via the :insert custom verb with the body", async () => {
    const { service, calls } = capturing({ storeCode: "S1", availability: "out_of_stock" });
    await service.insertLocal("online~en~US~SKU1", { storeCode: "S1", availability: "out_of_stock" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/online~en~US~SKU1/localInventories:insert`);
    expect(calls[0]?.body).toEqual({ storeCode: "S1", availability: "out_of_stock" });
  });

  it("deletes by store code, percent-encoding it", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteLocal("p", "store/1 a");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(`${BASE}/p/localInventories/store%2F1%20a`);
  });

  it("normalizes a full product resource name to its segment", async () => {
    const { service, calls } = capturing({ localInventories: [] });
    await service.listLocal("accounts/123/products/online~en~US~SKU1");
    expect(calls[0]?.url).toBe(`${BASE}/online~en~US~SKU1/localInventories`);
  });
});

describe("InventoriesService — regional", () => {
  it("lists regional inventories", async () => {
    const { service, calls } = capturing({ regionalInventories: [{ region: "US-CA" }] });
    const items = await service.listRegional("p");
    expect(items.map((i) => i.region)).toEqual(["US-CA"]);
    expect(calls[0]?.url).toBe(`${BASE}/p/regionalInventories`);
  });

  it("inserts a regional inventory", async () => {
    const { service, calls } = capturing({ region: "US-CA" });
    await service.insertRegional("p", { region: "US-CA", availability: "in_stock" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/p/regionalInventories:insert`);
    expect(calls[0]?.body).toEqual({ region: "US-CA", availability: "in_stock" });
  });

  it("deletes by region id, percent-encoding it", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteRegional("p", "US CA");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(`${BASE}/p/regionalInventories/US%20CA`);
  });

  it("normalizes a full product resource name to its segment (shared productBase)", async () => {
    const { service, calls } = capturing({ regionalInventories: [] });
    await service.listRegional("accounts/123/products/online~en~US~SKU1");
    expect(calls[0]?.url).toBe(`${BASE}/online~en~US~SKU1/regionalInventories`);
  });
});
