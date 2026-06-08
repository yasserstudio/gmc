import { describe, it, expect } from "vitest";
import { MerchantClient, type MerchantClientOptions } from "../src/client.js";
import type { Clock } from "../src/rate-limiter.js";

const auth = {
  getAccessToken: async () => "tok",
  getClientEmail: () => "e",
  getProjectId: () => undefined,
};

// now() fixed at 0 + no-op sleep: buckets start full so no test hits a real
// rate-limit wait, and retry backoff is instant.
const instantClock: Clock = { now: () => 0, sleep: async () => {} };

function makeClient(
  fetchImpl: typeof fetch,
  overrides: Partial<MerchantClientOptions> = {},
): MerchantClient {
  return new MerchantClient({
    auth,
    accountId: "123",
    fetchImpl,
    clock: instantClock,
    ...overrides,
  });
}

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe("MerchantClient", () => {
  it("GET returns parsed JSON and sends a bearer token to the built URL", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(200, { name: "accounts/123" });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    const res = await client.get<{ name: string }>("accounts", "accounts/v1beta/accounts/123");

    expect(res.name).toBe("accounts/123");
    expect(capturedUrl).toBe("https://merchantapi.googleapis.com/accounts/v1beta/accounts/123");
    expect((capturedInit?.headers as Record<string, string>)["authorization"]).toBe("Bearer tok");
  });

  it("POST sends a JSON body and content-type", async () => {
    let init: RequestInit | undefined;
    const fetchImpl = (async (_url: string, i: RequestInit) => {
      init = i;
      return jsonResponse(200, { ok: true });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    await client.post("products", "products/v1beta/x", { value: 1 });

    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ value: 1 });
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("returns undefined for a 204 No Content", async () => {
    const fetchImpl = (async () => jsonResponse(204)) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    expect(await client.delete("products", "products/v1beta/x")).toBeUndefined();
  });

  it("throws MerchantApiError carrying the reason and exit code on a 4xx", async () => {
    const body = {
      error: {
        code: 403,
        status: "PERMISSION_DENIED",
        details: [
          { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" },
        ],
      },
    };
    const fetchImpl = (async () => jsonResponse(403, body)) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);

    await expect(client.get("accounts", "x")).rejects.toMatchObject({
      name: "MerchantApiError",
      httpStatus: 403,
      code: "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
      retryable: false,
      exitCode: 5,
    });
  });

  it("retries a 429 and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls < 3
        ? jsonResponse(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } })
        : jsonResponse(200, { ok: true });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    const res = await client.get<{ ok: boolean }>("products", "x");
    expect(res.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("gives up after the retry budget on a persistent 503", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse(503, { error: { code: 503 } });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    await expect(client.get("reports", "x")).rejects.toMatchObject({ httpStatus: 503, retryable: true });
    expect(calls).toBe(4); // initial attempt + 3 retries
  });

  it("never lets a path escape the base origin", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await client.get("accounts", "https://evil.example/steal");
    expect(new URL(capturedUrl).origin).toBe("https://merchantapi.googleapis.com");
  });

  it("encodes query params and omits undefined values", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await client.get("products", "products/v1beta/x", { pageSize: 50, filter: undefined });
    const u = new URL(capturedUrl);
    expect(u.searchParams.get("pageSize")).toBe("50");
    expect(u.searchParams.has("filter")).toBe(false);
  });

  it("wraps a transient network error and retries", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls < 2) throw new Error("ECONNRESET");
      return jsonResponse(200, { ok: true });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const res = await client.get<{ ok: boolean }>("accounts", "x");
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("surfaces a persistent network failure as MerchantApiError(NETWORK_ERROR)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      throw new Error("down");
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.get("accounts", "x")).rejects.toMatchObject({
      name: "MerchantApiError",
      code: "NETWORK_ERROR",
      retryable: true,
      exitCode: 5,
    });
    expect(calls).toBe(4);
  });

  it("honors a numeric Retry-After header", async () => {
    const sleeps: number[] = [];
    const clock: Clock = { now: () => 0, sleep: async (ms) => void sleeps.push(ms) };
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls < 2
        ? new Response(JSON.stringify({ error: { code: 429 } }), {
            status: 429,
            headers: { "retry-after": "2" },
          })
        : jsonResponse(200, { ok: true });
    }) as unknown as typeof fetch;
    const client = new MerchantClient({ auth, accountId: "123", fetchImpl, clock });
    await client.get("products", "x");
    expect(sleeps).toContain(2000);
  });

  it("aborts pagination if the server repeats a pageToken", async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, { accounts: [{ id: 1 }], nextPageToken: "same" })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const run = async (): Promise<number[]> => {
      const out: number[] = [];
      for await (const item of client.paginate<{ id: number }>("accounts", "x", {
        select: (page) => (page as { accounts?: { id: number }[] }).accounts ?? [],
      })) {
        out.push(item.id);
        if (out.length > 5) break;
      }
      return out;
    };
    await expect(run()).rejects.toThrow(/did not advance/);
  });

  it("paginate follows nextPageToken and yields every item", async () => {
    const pages = [
      { accounts: [{ id: 1 }, { id: 2 }], nextPageToken: "p2" },
      { accounts: [{ id: 3 }] },
    ];
    const urls: string[] = [];
    let call = 0;
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    const ids: number[] = [];
    for await (const item of client.paginate<{ id: number }>("accounts", "accounts/v1beta/accounts", {
      select: (page) => (page as { accounts?: { id: number }[] }).accounts ?? [],
    })) {
      ids.push(item.id);
    }

    expect(ids).toEqual([1, 2, 3]);
    expect(call).toBe(2);
    expect(urls[1]).toContain("pageToken=p2");
  });
});
