import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { DataSourcesService, dataSourceSegment } from "../src/datasources.js";
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

function service(fetchImpl: typeof fetch): DataSourcesService {
  return new DataSourcesService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
}

describe("DataSourcesService", () => {
  it("getDataSource GETs the data source and parses it", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return jsonResponse(200, { name: "accounts/123/dataSources/55", displayName: "API feed" });
    }) as unknown as typeof fetch;

    const ds = await service(fetchImpl).getDataSource("55");

    expect(ds.displayName).toBe("API feed");
    expect(url).toBe(
      "https://merchantapi.googleapis.com/datasources/v1/accounts/123/dataSources/55",
    );
  });

  it("listDataSources follows nextPageToken and flattens every page", async () => {
    const pages = [
      {
        dataSources: [
          { name: "accounts/123/dataSources/1" },
          { name: "accounts/123/dataSources/2" },
        ],
        nextPageToken: "p2",
      },
      { dataSources: [{ name: "accounts/123/dataSources/3" }] },
    ];
    const urls: string[] = [];
    let call = 0;
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;

    const list = await service(fetchImpl).listDataSources();

    expect(list.map((d) => d.name)).toEqual([
      "accounts/123/dataSources/1",
      "accounts/123/dataSources/2",
      "accounts/123/dataSources/3",
    ]);
    expect(urls[0]).toBe(
      "https://merchantapi.googleapis.com/datasources/v1/accounts/123/dataSources",
    );
    expect(urls[1]).toContain("pageToken=p2");
  });

  it("createDataSource POSTs the body to dataSources and parses the result", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const fetchImpl = (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return jsonResponse(200, {
        name: "accounts/123/dataSources/55",
        dataSourceId: "55",
        displayName: "API feed",
      });
    }) as unknown as typeof fetch;

    const body = {
      displayName: "API feed",
      primaryProductDataSource: { contentLanguage: "en", feedLabel: "US" },
    };
    const result = await service(fetchImpl).createDataSource(body);

    expect(result.dataSourceId).toBe("55");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(body);
    expect(url).toBe("https://merchantapi.googleapis.com/datasources/v1/accounts/123/dataSources");
  });

  it("deleteDataSource DELETEs the data source (204 → undefined)", async () => {
    let url = "";
    let method = "";
    const fetchImpl = (async (u: string, i: RequestInit) => {
      url = u;
      method = i.method ?? "";
      return jsonResponse(204);
    }) as unknown as typeof fetch;

    const res = await service(fetchImpl).deleteDataSource("accounts/123/dataSources/55");

    expect(res).toBeUndefined();
    expect(method).toBe("DELETE");
    expect(url).toBe(
      "https://merchantapi.googleapis.com/datasources/v1/accounts/123/dataSources/55",
    );
  });

  it("dataSourceSegment normalizes ids and resource names", () => {
    expect(dataSourceSegment("55")).toBe("55");
    expect(dataSourceSegment("accounts/123/dataSources/55")).toBe("55");
  });
});
