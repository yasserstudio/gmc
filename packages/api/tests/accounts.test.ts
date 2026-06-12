import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { AccountsService, accountResourceName } from "../src/accounts.js";
import type { Clock } from "../src/rate-limiter.js";

const auth = {
  getAccessToken: async () => "tok",
  getClientEmail: () => "e",
  getProjectId: () => undefined,
};

// Fixed clock + no-op sleep: buckets start full and retry backoff is instant.
const instantClock: Clock = { now: () => 0, sleep: async () => {} };

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function service(fetchImpl: typeof fetch): AccountsService {
  // No accountId: the service targets accounts explicitly per call.
  return new AccountsService(new MerchantClient({ auth, fetchImpl, clock: instantClock }));
}

// Capture the URL/method/body of each request for the write-method tests.
function capturing(
  body: unknown,
  status = 200,
): { service: AccountsService; calls: { url: string; method?: string; body?: unknown }[] } {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    calls.push({
      url: u,
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return jsonResponse(status, body);
  }) as unknown as typeof fetch;
  return { service: service(fetchImpl), calls };
}

const ACCT = "https://merchantapi.googleapis.com/accounts/v1/accounts/123";

describe("AccountsService", () => {
  it("getAccount GETs accounts/v1/accounts/{id} and parses the resource", async () => {
    let url = "";
    let method = "";
    const fetchImpl = (async (u: string, init: RequestInit) => {
      url = u;
      method = init.method ?? "GET";
      return jsonResponse(200, { name: "accounts/123", accountName: "My Store" });
    }) as unknown as typeof fetch;

    const account = await service(fetchImpl).getAccount("123");

    expect(account.accountName).toBe("My Store");
    expect(url).toBe("https://merchantapi.googleapis.com/accounts/v1/accounts/123");
    expect(method).toBe("GET");
  });

  it("listAccounts follows nextPageToken and flattens every page", async () => {
    const pages = [
      { accounts: [{ name: "accounts/1" }, { name: "accounts/2" }], nextPageToken: "p2" },
      { accounts: [{ name: "accounts/3" }] },
    ];
    const urls: string[] = [];
    let call = 0;
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;

    const accounts = await service(fetchImpl).listAccounts();

    expect(accounts.map((a) => a.name)).toEqual(["accounts/1", "accounts/2", "accounts/3"]);
    expect(call).toBe(2);
    expect(urls[0]).toBe("https://merchantapi.googleapis.com/accounts/v1/accounts");
    expect(urls[1]).toContain("pageToken=p2");
  });

  it("getInfo composes account+businessInfo+homepage and folds a 404 sub-resource to null", async () => {
    const fetchImpl = (async (u: string) => {
      if (u.endsWith("/businessInfo")) {
        return jsonResponse(200, {
          name: "accounts/123/businessInfo",
          address: { regionCode: "US" },
        });
      }
      if (u.endsWith("/homepage")) {
        return jsonResponse(404, { error: { code: 404, status: "NOT_FOUND" } });
      }
      return jsonResponse(200, { name: "accounts/123", accountName: "My Store" });
    }) as unknown as typeof fetch;

    const info = await service(fetchImpl).getInfo("123");

    expect(info.account.accountName).toBe("My Store");
    expect(info.businessInfo?.address?.regionCode).toBe("US");
    expect(info.homepage).toBeNull();
  });

  it("getInfo propagates a non-404 sub-resource error", async () => {
    const fetchImpl = (async (u: string) => {
      if (u.endsWith("/businessInfo")) {
        return jsonResponse(403, { error: { code: 403, status: "PERMISSION_DENIED" } });
      }
      return jsonResponse(200, { name: "accounts/123" });
    }) as unknown as typeof fetch;

    await expect(service(fetchImpl).getInfo("123")).rejects.toMatchObject({
      name: "MerchantApiError",
      httpStatus: 403,
    });
  });

  it("updateAccount PATCHes the account with an updateMask derived from the input keys", async () => {
    const { service, calls } = capturing({ name: "accounts/123", accountName: "New" });
    await service.updateAccount("123", { accountName: "New", adultContent: false });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(`${ACCT}?updateMask=accountName%2CadultContent`);
    expect(calls[0]?.body).toEqual({ accountName: "New", adultContent: false });
  });

  it("updateAccount honors an explicit updateMask", async () => {
    const { service, calls } = capturing({});
    await service.updateAccount("123", { accountName: "X" }, { updateMask: "accountName" });
    expect(calls[0]?.url).toBe(`${ACCT}?updateMask=accountName`);
    expect(calls[0]?.body).toEqual({ accountName: "X" });
  });

  it("updateBusinessInfo PATCHes the businessInfo sub-resource", async () => {
    const { service, calls } = capturing({ name: "accounts/123/businessInfo" });
    await service.updateBusinessInfo("123", { address: { regionCode: "US" } });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(`${ACCT}/businessInfo?updateMask=address`);
    expect(calls[0]?.body).toEqual({ address: { regionCode: "US" } });
  });

  it("updateHomepage PATCHes the homepage sub-resource with the uri", async () => {
    const { service, calls } = capturing({ name: "accounts/123/homepage", uri: "https://x.com" });
    await service.updateHomepage("123", { uri: "https://x.com" });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(`${ACCT}/homepage?updateMask=uri`);
    expect(calls[0]?.body).toEqual({ uri: "https://x.com" });
  });

  it("claimHomepage POSTs homepage:claim with the overwrite flag", async () => {
    const { service, calls } = capturing({ name: "accounts/123/homepage", claimed: true });
    await service.claimHomepage("123", { overwrite: true });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${ACCT}/homepage:claim`);
    expect(calls[0]?.body).toEqual({ overwrite: true });
  });

  it("claimHomepage omits overwrite from the body when not given", async () => {
    const { service, calls } = capturing({ claimed: true });
    await service.claimHomepage("123");
    expect(calls[0]?.body).toEqual({});
  });

  it("unclaimHomepage POSTs homepage:unclaim with no body", async () => {
    const { service, calls } = capturing({ name: "accounts/123/homepage", claimed: false });
    await service.unclaimHomepage("123");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${ACCT}/homepage:unclaim`);
    expect(calls[0]?.body).toBeUndefined();
  });

  it("accountResourceName normalizes ids and percent-encodes the id segment", () => {
    expect(accountResourceName("123")).toBe("accounts/123");
    expect(accountResourceName("accounts/123")).toBe("accounts/123");
    // Encoding keeps a stray separator from escaping the path segment.
    expect(accountResourceName("12/3")).toBe("accounts/12%2F3");
  });
});
