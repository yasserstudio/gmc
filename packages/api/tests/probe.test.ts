import { describe, it, expect } from "vitest";
import { probeMerchantApi } from "../src/probe.js";

// Build a fetch stub that returns a real Response with the given status/body.
function fetchReturning(status: number, body?: unknown): typeof fetch {
  return (async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
    })) as unknown as typeof fetch;
}

describe("probeMerchantApi", () => {
  it("passes with accessible accounts (accounts.list)", async () => {
    const r = await probeMerchantApi("tok", {
      fetchImpl: fetchReturning(200, { accounts: [{}, {}] }),
    });
    expect(r.status).toBe("pass");
    expect(r.accountCount).toBe(2);
  });

  it("fails on an empty account list (the silent linking trap)", async () => {
    const r = await probeMerchantApi("tok", { fetchImpl: fetchReturning(200, { accounts: [] }) });
    expect(r.status).toBe("fail");
    expect(r.accountCount).toBe(0);
    expect(r.suggestion).toMatch(/link|register/i);
  });

  it("passes accounts.get for a configured account", async () => {
    const r = await probeMerchantApi("tok", {
      accountId: "123",
      fetchImpl: fetchReturning(200, { name: "accounts/123" }),
    });
    expect(r.status).toBe("pass");
    expect(r.message).toContain("123");
  });

  it("fails on a 401 (token rejected)", async () => {
    const r = await probeMerchantApi("tok", {
      fetchImpl: fetchReturning(401, { error: { code: 401 } }),
    });
    expect(r.status).toBe("fail");
    expect(r.httpStatus).toBe(401);
    expect(r.message).toMatch(/401|Unauthorized/);
  });

  const unregisteredBody = {
    error: {
      code: 401,
      message:
        "GCP project with id sahla-market and number 807481587962 is not registered with the merchant account. Please follow these steps https://developers.google.com/merchant/api/guides/quickstart.",
    },
  };

  it.each([401, 403])(
    "detects the unregistered-project trap (%i) and gives the registration fix, not 're-authenticate'",
    async (status) => {
      const r = await probeMerchantApi("tok", {
        fetchImpl: fetchReturning(status, unregisteredBody),
      });
      expect(r.status).toBe("fail");
      expect(r.message).toMatch(/not registered as an API client/i);
      // Surfaces the specific project so the user knows which one to register.
      expect(r.message).toContain("807481587962");
      expect(r.suggestion).toMatch(/Register the Cloud project/i);
      expect(r.suggestion).not.toMatch(/Re-authenticate/i);
    },
  );

  it("detects SERVICE_DISABLED and surfaces the activation URL and project", async () => {
    const body = {
      error: {
        code: 403,
        status: "PERMISSION_DENIED",
        details: [
          {
            reason: "SERVICE_DISABLED",
            metadata: {
              consumer: "projects/999",
              activationUrl: "https://console.cloud.google.com/x?project=999",
            },
          },
        ],
      },
    };
    const r = await probeMerchantApi("tok", { fetchImpl: fetchReturning(403, body) });
    expect(r.status).toBe("fail");
    expect(r.reason).toBe("SERVICE_DISABLED");
    expect(r.message).toContain("999");
    expect(r.suggestion).toContain("https://console.cloud.google.com/x?project=999");
  });

  it("reports a generic 403 as a permission/registration problem", async () => {
    const r = await probeMerchantApi("tok", {
      fetchImpl: fetchReturning(403, { error: { code: 403, status: "PERMISSION_DENIED" } }),
    });
    expect(r.status).toBe("fail");
    expect(r.httpStatus).toBe(403);
    expect(r.message).toContain("Permission denied");
  });

  it("reports a 404 for a configured account", async () => {
    const r = await probeMerchantApi("tok", {
      accountId: "123",
      fetchImpl: fetchReturning(404, { error: { code: 404 } }),
    });
    expect(r.status).toBe("fail");
    expect(r.message).toContain("123");
  });

  it("buckets a 429 as rate-limiting", async () => {
    const r = await probeMerchantApi("tok", {
      fetchImpl: fetchReturning(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } }),
    });
    expect(r.status).toBe("fail");
    expect(r.httpStatus).toBe(429);
    expect(r.message).toMatch(/rate-limited/i);
  });

  it("buckets a 400 as a bad request and includes the API message", async () => {
    const r = await probeMerchantApi("tok", {
      fetchImpl: fetchReturning(400, { error: { code: 400, message: "Invalid account id" } }),
    });
    expect(r.status).toBe("fail");
    expect(r.message).toContain("400");
    expect(r.message).toContain("Invalid account id");
  });

  it("treats a 5xx as a transient outage", async () => {
    const r = await probeMerchantApi("tok", { fetchImpl: fetchReturning(503) });
    expect(r.status).toBe("fail");
    expect(r.suggestion).toMatch(/transient|retry/i);
  });

  it("distinguishes a timeout from a generic network failure", async () => {
    const r = await probeMerchantApi("tok", {
      fetchImpl: (async () => {
        const e = new Error("aborted");
        e.name = "TimeoutError";
        throw e;
      }) as unknown as typeof fetch,
    });
    expect(r.status).toBe("fail");
    expect(r.message).toContain("timed out");
  });

  it("fails gracefully when the request throws", async () => {
    const r = await probeMerchantApi("tok", {
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    expect(r.status).toBe("fail");
    expect(r.message).toContain("Could not reach");
  });
});
