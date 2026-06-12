import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { QuotaService } from "../src/quota.js";
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

function service(fetchImpl: typeof fetch): QuotaService {
  return new QuotaService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
}

const BASE = "https://merchantapi.googleapis.com/quota/v1/accounts/123/quotas";

describe("QuotaService", () => {
  it("lists quota groups for the account", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return jsonResponse(200, {
        quotaGroups: [
          { name: "accounts/123/quotas/products", quotaUsage: "12", quotaLimit: "1000000" },
        ],
      });
    }) as unknown as typeof fetch;

    const groups = await service(fetchImpl).listQuotas();

    expect(groups).toHaveLength(1);
    expect(groups[0]?.quotaUsage).toBe("12");
    expect(url).toBe(BASE);
  });

  it("follows nextPageToken and flattens every page", async () => {
    const pages = [
      { quotaGroups: [{ name: "accounts/123/quotas/products" }], nextPageToken: "p2" },
      { quotaGroups: [{ name: "accounts/123/quotas/reports" }] },
    ];
    const urls: string[] = [];
    let call = 0;
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;

    const groups = await service(fetchImpl).listQuotas();

    expect(groups.map((g) => g.name?.split("/").pop())).toEqual(["products", "reports"]);
    expect(urls[0]).toBe(BASE);
    expect(urls[1]).toContain("pageToken=p2");
  });
});
