import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { ConversionsService, conversionSourceSegment } from "../src/conversions.js";
import type { ConversionSourceInput } from "../src/conversions.js";
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
  service: ConversionsService;
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
  const service = new ConversionsService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
  return { service, calls };
}

const BASE = "https://merchantapi.googleapis.com/conversions/v1/accounts/123/conversionSources";

describe("conversionSourceSegment", () => {
  it("reduces a full resource name to its id", () => {
    expect(conversionSourceSegment("accounts/123/conversionSources/abc")).toBe("abc");
    expect(conversionSourceSegment("abc")).toBe("abc");
  });
});

describe("ConversionsService", () => {
  it("lists sources, following pagination", async () => {
    let call = 0;
    const pages = [
      {
        conversionSources: [{ name: "accounts/123/conversionSources/a" }],
        nextPageToken: "t2",
      },
      { conversionSources: [{ name: "accounts/123/conversionSources/b" }] },
    ];
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;
    const service = new ConversionsService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );
    const list = await service.listConversionSources();
    expect(list.map((s) => conversionSourceSegment(s.name ?? ""))).toEqual(["a", "b"]);
    expect(urls[0]).toBe(BASE);
    expect(urls[1]).toContain("pageToken=t2");
  });

  it("gets a source, normalizing a full resource name", async () => {
    const { service, calls } = capturing({ name: "accounts/123/conversionSources/abc" });
    await service.getConversionSource("accounts/123/conversionSources/abc");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${BASE}/abc`);
  });

  it("creates a source by POSTing the body (no id in the path/query)", async () => {
    const { service, calls } = capturing({ name: "accounts/123/conversionSources/new" });
    const input: ConversionSourceInput = {
      merchantCenterDestination: { currencyCode: "USD", displayName: "My MC" },
    };
    await service.createConversionSource(input);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(BASE);
    expect(calls[0]?.body).toEqual(input);
  });

  it("patches a source, defaulting updateMask to the input keys", async () => {
    const { service, calls } = capturing({});
    await service.updateConversionSource("abc", {
      merchantCenterDestination: { displayName: "Renamed" },
    });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(`${BASE}/abc?updateMask=merchantCenterDestination`);
    expect(calls[0]?.body).toEqual({ merchantCenterDestination: { displayName: "Renamed" } });
  });

  it("patches with an explicit nested updateMask when provided", async () => {
    const { service, calls } = capturing({});
    await service.updateConversionSource(
      "abc",
      { merchantCenterDestination: { displayName: "Renamed" } },
      { updateMask: "merchantCenterDestination.displayName" },
    );
    expect(calls[0]?.url).toBe(`${BASE}/abc?updateMask=merchantCenterDestination.displayName`);
  });

  it("deletes (archives) a source by id", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteConversionSource("abc");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(`${BASE}/abc`);
  });

  it("undeletes a source via the :undelete colon-verb with no body", async () => {
    const { service, calls } = capturing({ name: "accounts/123/conversionSources/abc" });
    await service.undeleteConversionSource("abc");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/abc:undelete`);
    expect(calls[0]?.body).toEqual({});
  });
});
