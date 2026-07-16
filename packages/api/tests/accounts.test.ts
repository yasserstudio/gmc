import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import {
  AccountsService,
  accountResourceName,
  userSegment,
  returnPolicySegment,
  programSegment,
} from "../src/accounts.js";
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

  it("listUsers follows nextPageToken and flattens every page", async () => {
    const pages = [
      { users: [{ name: "accounts/123/users/a@x.com" }], nextPageToken: "p2" },
      { users: [{ name: "accounts/123/users/b@x.com" }] },
    ];
    let call = 0;
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;

    const list = await service(fetchImpl).listUsers("123");

    expect(list.map((u) => userSegment(u.name ?? ""))).toEqual(["a@x.com", "b@x.com"]);
    expect(urls[0]).toBe(`${ACCT}/users`);
    expect(urls[1]).toContain("pageToken=p2");
  });

  it("getUser GETs the user, percent-encoding the email", async () => {
    const { service, calls } = capturing({ name: "accounts/123/users/a@x.com" });
    await service.getUser("123", "a@x.com");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${ACCT}/users/a%40x.com`);
  });

  it("createUser POSTs with the email as a userId query param (not in path/body)", async () => {
    const { service, calls } = capturing({ name: "accounts/123/users/a@x.com" });
    await service.createUser("123", "a@x.com", { accessRights: ["ADMIN"] });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${ACCT}/users?userId=a%40x.com`);
    expect(calls[0]?.body).toEqual({ accessRights: ["ADMIN"] });
  });

  it("updateUser PATCHes with updateMask defaulting to the input keys", async () => {
    const { service, calls } = capturing({ name: "accounts/123/users/a@x.com" });
    await service.updateUser("123", "a@x.com", { accessRights: ["STANDARD"] });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(`${ACCT}/users/a%40x.com?updateMask=accessRights`);
    expect(calls[0]?.body).toEqual({ accessRights: ["STANDARD"] });
  });

  it("deleteUser DELETEs the user by email", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteUser("123", "accounts/123/users/a@x.com");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(`${ACCT}/users/a%40x.com`);
  });

  it("createAccount POSTs accounts:createAndConfigure with the request body", async () => {
    const { service, calls } = capturing({ name: "accounts/999", accountId: "999" });
    const body = {
      account: { accountName: "Sub", timeZone: { id: "UTC" }, languageCode: "en-US" },
      service: [{ accountAggregation: {}, provider: "accounts/123" }],
    };
    const result = await service.createAccount(body);
    expect(result.accountId).toBe("999");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(
      "https://merchantapi.googleapis.com/accounts/v1/accounts:createAndConfigure",
    );
    expect(calls[0]?.body).toEqual(body);
  });

  it("deleteAccount DELETEs the account, omitting force by default", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteAccount("123");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(ACCT);
  });

  it("deleteAccount adds ?force=true when force is set", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteAccount("123", { force: true });
    expect(calls[0]?.url).toBe(`${ACCT}?force=true`);
  });

  it("getBusinessIdentity GETs the businessIdentity sub-resource", async () => {
    const { service, calls } = capturing({ name: "accounts/123/businessIdentity" });
    await service.getBusinessIdentity("123");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${ACCT}/businessIdentity`);
  });

  it("updateBusinessIdentity PATCHes with a derived updateMask", async () => {
    const { service, calls } = capturing({ name: "accounts/123/businessIdentity" });
    await service.updateBusinessIdentity("123", {
      smallBusiness: { identityDeclaration: "SELF_IDENTIFIES_AS" },
    });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(`${ACCT}/businessIdentity?updateMask=smallBusiness`);
    expect(calls[0]?.body).toEqual({
      smallBusiness: { identityDeclaration: "SELF_IDENTIFIES_AS" },
    });
  });

  it("getAutofeedSettings GETs and updateAutofeedSettings PATCHes with updateMask", async () => {
    const get = capturing({ enableProducts: true, eligible: true });
    await get.service.getAutofeedSettings("123");
    expect(get.calls[0]?.url).toBe(`${ACCT}/autofeedSettings`);

    const upd = capturing({ enableProducts: false });
    await upd.service.updateAutofeedSettings("123", { enableProducts: false });
    expect(upd.calls[0]?.method).toBe("PATCH");
    expect(upd.calls[0]?.url).toBe(`${ACCT}/autofeedSettings?updateMask=enableProducts`);
    expect(upd.calls[0]?.body).toEqual({ enableProducts: false });
  });

  it("getDeveloperRegistration GETs developerRegistration and parses gcpIds", async () => {
    const get = capturing({ name: "accounts/123/developerRegistration", gcpIds: ["999"] });
    const reg = await get.service.getDeveloperRegistration("123");
    expect(get.calls[0]?.method).toBe("GET");
    expect(get.calls[0]?.url).toBe(`${ACCT}/developerRegistration`);
    expect(reg.gcpIds).toEqual(["999"]);
  });

  it("registerGcp POSTs :registerGcp with the developerEmail when given", async () => {
    const { service, calls } = capturing({});
    await service.registerGcp("123", { developerEmail: "dev@x.com" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${ACCT}/developerRegistration:registerGcp`);
    expect(calls[0]?.body).toEqual({ developerEmail: "dev@x.com" });
  });

  it("registerGcp sends no body when no developerEmail is given", async () => {
    const { service, calls } = capturing({});
    await service.registerGcp("123");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toBeUndefined();
  });

  it("unregisterGcp POSTs :unregisterGcp with no body", async () => {
    const { service, calls } = capturing({});
    await service.unregisterGcp("123");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${ACCT}/developerRegistration:unregisterGcp`);
    expect(calls[0]?.body).toBeUndefined();
  });

  it("getShippingSettings GETs; insertShippingSettings POSTs :insert with the body (incl. etag)", async () => {
    const get = capturing({ name: "accounts/123/shippingSettings", etag: "abc", services: [] });
    await get.service.getShippingSettings("123");
    expect(get.calls[0]?.url).toBe(`${ACCT}/shippingSettings`);

    const ins = capturing({ etag: "def" });
    const body = { etag: "abc", services: [{ serviceName: "s" }] };
    await ins.service.insertShippingSettings("123", body);
    expect(ins.calls[0]?.method).toBe("POST");
    expect(ins.calls[0]?.url).toBe(`${ACCT}/shippingSettings:insert`);
    expect(ins.calls[0]?.body).toEqual(body);
  });

  it("listReturnPolicies follows pagination, flattening onlineReturnPolicies", async () => {
    const pages = [
      { onlineReturnPolicies: [{ returnPolicyId: "a" }], nextPageToken: "p2" },
      { onlineReturnPolicies: [{ returnPolicyId: "b" }] },
    ];
    let call = 0;
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;
    const list = await service(fetchImpl).listReturnPolicies("123");
    expect(list.map((p) => p.returnPolicyId)).toEqual(["a", "b"]);
    expect(urls[0]).toBe(`${ACCT}/onlineReturnPolicies`);
    expect(urls[1]).toContain("pageToken=p2");
  });

  it("getReturnPolicy/createReturnPolicy/deleteReturnPolicy hit the right paths", async () => {
    const g = capturing({ returnPolicyId: "rp1" });
    await g.service.getReturnPolicy("123", "accounts/123/onlineReturnPolicies/rp1");
    expect(g.calls[0]?.method).toBe("GET");
    expect(g.calls[0]?.url).toBe(`${ACCT}/onlineReturnPolicies/rp1`);

    const c = capturing({ returnPolicyId: "rp2" });
    await c.service.createReturnPolicy("123", { label: "default", countries: ["US"] });
    expect(c.calls[0]?.method).toBe("POST");
    expect(c.calls[0]?.url).toBe(`${ACCT}/onlineReturnPolicies`); // no id query
    expect(c.calls[0]?.body).toEqual({ label: "default", countries: ["US"] });

    const d = capturing(undefined, 204);
    await d.service.deleteReturnPolicy("123", "rp1");
    expect(d.calls[0]?.method).toBe("DELETE");
    expect(d.calls[0]?.url).toBe(`${ACCT}/onlineReturnPolicies/rp1`);
  });

  it("returnPolicySegment reduces a full resource name to the bare id", () => {
    expect(returnPolicySegment("accounts/123/onlineReturnPolicies/rp1")).toBe("rp1");
    expect(returnPolicySegment("rp1")).toBe("rp1");
  });

  it("listPrograms follows nextPageToken and flattens every page", async () => {
    const pages = [
      {
        programs: [{ name: "accounts/123/programs/free-listings", state: "ENABLED" }],
        nextPageToken: "p2",
      },
      { programs: [{ name: "accounts/123/programs/shopping-ads", state: "ELIGIBLE" }] },
    ];
    const urls: string[] = [];
    let call = 0;
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;

    const programs = await service(fetchImpl).listPrograms("123");

    expect(programs.map((p) => p.name)).toEqual([
      "accounts/123/programs/free-listings",
      "accounts/123/programs/shopping-ads",
    ]);
    expect(urls[0]).toBe(`${ACCT}/programs`);
    expect(urls[1]).toContain("pageToken=p2");
  });

  it("getProgram GETs the program, percent-encoding the id segment", async () => {
    const { service: svc, calls } = capturing({
      name: "accounts/123/programs/free-listings",
      state: "ENABLED",
    });
    const p = await svc.getProgram("123", "accounts/123/programs/free-listings");
    expect(p.state).toBe("ENABLED");
    expect(calls[0]?.method).toBe("GET");
    // The full resource name is reduced to the bare id before building the path.
    expect(calls[0]?.url).toBe(`${ACCT}/programs/free-listings`);
  });

  it("enableProgram POSTs :enable with no body and returns the Program", async () => {
    const { service: svc, calls } = capturing({
      name: "accounts/123/programs/free-listings",
      state: "ENABLED",
    });
    const p = await svc.enableProgram("123", "free-listings");
    expect(p.state).toBe("ENABLED");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${ACCT}/programs/free-listings:enable`);
    expect(calls[0]?.body).toBeUndefined();
  });

  it("disableProgram POSTs :disable with no body and returns the Program", async () => {
    const { service: svc, calls } = capturing({
      name: "accounts/123/programs/free-listings",
      state: "ELIGIBLE",
    });
    const p = await svc.disableProgram("123", "free-listings");
    expect(p.state).toBe("ELIGIBLE");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${ACCT}/programs/free-listings:disable`);
    expect(calls[0]?.body).toBeUndefined();
  });

  it("programSegment reduces a full resource name to the bare id", () => {
    expect(programSegment("accounts/123/programs/free-listings")).toBe("free-listings");
    expect(programSegment("free-listings")).toBe("free-listings");
  });

  it("userSegment reduces a full resource name to the bare email", () => {
    expect(userSegment("accounts/123/users/a@x.com")).toBe("a@x.com");
    expect(userSegment("a@x.com")).toBe("a@x.com");
    expect(userSegment("me")).toBe("me");
  });

  it("accountResourceName normalizes ids and percent-encodes the id segment", () => {
    expect(accountResourceName("123")).toBe("accounts/123");
    expect(accountResourceName("accounts/123")).toBe("accounts/123");
    // Encoding keeps a stray separator from escaping the path segment.
    expect(accountResourceName("12/3")).toBe("accounts/12%2F3");
  });
});
