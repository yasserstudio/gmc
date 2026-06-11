import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { RegionsService, regionSegment } from "../src/regions.js";
import type { RegionInput } from "../src/regions.js";
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
  service: RegionsService;
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
  const service = new RegionsService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
  return { service, calls };
}

const BASE = "https://merchantapi.googleapis.com/accounts/v1/accounts/123/regions";

describe("regionSegment", () => {
  it("reduces a full resource name to its id", () => {
    expect(regionSegment("accounts/123/regions/usa-ca")).toBe("usa-ca");
    expect(regionSegment("usa-ca")).toBe("usa-ca");
  });
});

describe("RegionsService", () => {
  it("gets a region, normalizing a full resource name", async () => {
    const { service, calls } = capturing({ name: "accounts/123/regions/usa-ca" });
    const r = await service.getRegion("accounts/123/regions/usa-ca");
    expect(r.name).toBe("accounts/123/regions/usa-ca");
    expect(calls[0]?.url).toBe(`${BASE}/usa-ca`);
    expect(calls[0]?.method).toBe("GET");
  });

  it("lists regions with pageSize and pagination", async () => {
    let call = 0;
    const pages = [
      { regions: [{ name: "accounts/123/regions/a" }], nextPageToken: "t2" },
      { regions: [{ name: "accounts/123/regions/b" }] },
    ];
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;
    const service = new RegionsService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );
    const list = await service.listRegions({ pageSize: 50 });
    expect(list.map((r) => regionSegment(r.name ?? ""))).toEqual(["a", "b"]);
    expect(urls[0]).toContain("pageSize=50");
  });

  it("creates a region with regionId as a query param (not in the path/body)", async () => {
    const { service, calls } = capturing({ name: "accounts/123/regions/usa-ca" });
    const input: RegionInput = {
      displayName: "California",
      postalCodeArea: { regionCode: "US", postalCodes: [{ begin: "90000", end: "90999" }] },
    };
    await service.createRegion("usa-ca", input);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}?regionId=usa-ca`);
    expect(calls[0]?.body).toEqual(input); // body is the Region, regionId is not in it
  });

  it("patches a region, defaulting updateMask to the input's own keys", async () => {
    const { service, calls } = capturing({ name: "accounts/123/regions/usa-ca" });
    await service.updateRegion("usa-ca", {
      displayName: "Cali",
      geotargetArea: { geotargetCriteriaIds: ["21137"] },
    });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(`${BASE}/usa-ca?updateMask=displayName%2CgeotargetArea`);
  });

  it("honors an explicit updateMask", async () => {
    const { service, calls } = capturing({});
    await service.updateRegion(
      "accounts/123/regions/usa-ca",
      { displayName: "X" },
      {
        updateMask: "displayName",
      },
    );
    expect(calls[0]?.url).toBe(`${BASE}/usa-ca?updateMask=displayName`);
    expect(calls[0]?.body).toEqual({ displayName: "X" });
  });

  it("deletes a region by id", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteRegion("usa-ca");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(`${BASE}/usa-ca`);
  });
});
