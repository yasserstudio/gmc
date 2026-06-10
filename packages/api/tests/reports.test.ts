import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { ReportsService } from "../src/reports.js";
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

const BASE = "https://merchantapi.googleapis.com/reports/v1/accounts/123/reports:search";

describe("ReportsService.search", () => {
  it("POSTs the MCQL query in the body to reports:search", async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    const fetchImpl = (async (u: string, init?: RequestInit) => {
      calls.push({
        url: u,
        method: init?.method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return jsonResponse(200, { results: [{ productPerformanceView: { clicks: "5" } }] });
    }) as unknown as typeof fetch;
    const service = new ReportsService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );

    const rows = await service.search("SELECT product_performance_view.clicks FROM product_performance_view", {
      pageSize: 100,
    });
    expect(rows).toEqual([{ productPerformanceView: { clicks: "5" } }]);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(BASE);
    expect(calls[0]?.body).toEqual({
      query: "SELECT product_performance_view.clicks FROM product_performance_view",
      pageSize: 100,
    });
  });

  it("follows pagination with pageToken in the body", async () => {
    let call = 0;
    const pages = [
      { results: [{ productPerformanceView: { clicks: "1" } }], nextPageToken: "t2" },
      { results: [{ productPerformanceView: { clicks: "2" } }] },
    ];
    const bodies: unknown[] = [];
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      bodies.push(typeof init?.body === "string" ? JSON.parse(init.body) : undefined);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;
    const service = new ReportsService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );

    const rows = await service.search("SELECT x FROM y");
    expect(rows).toHaveLength(2);
    expect((bodies[1] as { pageToken?: string }).pageToken).toBe("t2");
  });

  it("returns an empty array when results is absent", async () => {
    const fetchImpl = (async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const service = new ReportsService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );
    expect(await service.search("SELECT x FROM y")).toEqual([]);
  });
});
