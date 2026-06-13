import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { IssuesService } from "../src/issues.js";
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

function service(fetchImpl: typeof fetch): IssuesService {
  return new IssuesService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
}

const ACCOUNT_URL =
  "https://merchantapi.googleapis.com/issueresolution/v1/accounts/123:renderaccountissues";

describe("IssuesService", () => {
  it("renders account issues and flattens renderedIssues", async () => {
    let url = "";
    let method = "";
    const fetchImpl = (async (u: string, init: RequestInit) => {
      url = u;
      method = String(init.method);
      return jsonResponse(200, {
        renderedIssues: [
          { title: "Misrepresentation", impact: { severity: "ERROR", message: "why" } },
        ],
      });
    }) as unknown as typeof fetch;

    const list = await service(fetchImpl).renderAccountIssues();

    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Misrepresentation");
    expect(method).toBe("POST");
    expect(url).toBe(ACCOUNT_URL);
  });

  it("passes languageCode and timeZone as query params", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return jsonResponse(200, { renderedIssues: [] });
    }) as unknown as typeof fetch;

    await service(fetchImpl).renderAccountIssues({
      languageCode: "en-GB",
      timeZone: "Europe/London",
    });

    expect(url).toContain("languageCode=en-GB");
    expect(url).toContain("timeZone=Europe%2FLondon");
  });

  it("renders product issues for the canonical product segment", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return jsonResponse(200, { renderedIssues: [{ title: "Image too small" }] });
    }) as unknown as typeof fetch;

    // Accepts a full resource name and reduces it to the bare product segment.
    const list = await service(fetchImpl).renderProductIssues(
      "accounts/123/products/online~en~US~sku1",
    );

    expect(list[0]?.title).toBe("Image too small");
    expect(url).toBe(
      "https://merchantapi.googleapis.com/issueresolution/v1/accounts/123/products/online~en~US~sku1:renderproductissues",
    );
  });

  it("accepts a bare product id unchanged", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return jsonResponse(200, { renderedIssues: [] });
    }) as unknown as typeof fetch;

    await service(fetchImpl).renderProductIssues("online~en~US~sku1");

    expect(url).toBe(
      "https://merchantapi.googleapis.com/issueresolution/v1/accounts/123/products/online~en~US~sku1:renderproductissues",
    );
  });

  it("cannot escape the configured account or reach :triggeraction via a hostile id", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return jsonResponse(200, { renderedIssues: [] });
    }) as unknown as typeof fetch;

    // productSegment strips the injected `accounts/999/products/` prefix and
    // encodeURIComponent neutralizes the colon, so the request stays scoped to 123.
    await service(fetchImpl).renderProductIssues("accounts/999/products/x:triggeraction");

    expect(url).toBe(
      "https://merchantapi.googleapis.com/issueresolution/v1/accounts/123/products/x%3Atriggeraction:renderproductissues",
    );
  });

  it("rejects an empty product id with a clear error", async () => {
    const fetchImpl = (async () => jsonResponse(200, {})) as unknown as typeof fetch;
    await expect(service(fetchImpl).renderProductIssues("accounts/123/products/")).rejects.toThrow(
      /empty product id/i,
    );
  });

  it("returns [] when the response carries no issues", async () => {
    const fetchImpl = (async () => jsonResponse(200, {})) as unknown as typeof fetch;
    expect(await service(fetchImpl).renderAccountIssues()).toEqual([]);
  });
});
