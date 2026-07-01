import { describe, it, expect } from "vitest";
import { RateLimiter, DEFAULT_RATE_LIMITS, type Clock } from "../src/rate-limiter.js";
import { SUB_APIS } from "../src/types.js";

// Deterministic clock: now() only advances when sleep()/advance() is called.
function fakeClock(): Clock & { advance: (ms: number) => void; sleeps: number[] } {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
      sleeps.push(ms);
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

describe("rate limiter buckets", () => {
  it("DEFAULT_RATE_LIMITS has a bucket for all twelve sub-APIs", () => {
    expect(SUB_APIS).toHaveLength(12);
    expect(SUB_APIS).toContain("lfp");
    expect(SUB_APIS).toContain("ordertracking");
    expect(Object.keys(DEFAULT_RATE_LIMITS).sort()).toEqual([...SUB_APIS].sort());
  });

  it("serves up to capacity immediately, then waits for a refill", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(
      { ...DEFAULT_RATE_LIMITS, products: { capacity: 2, refillPerSecond: 1 } },
      clock,
    );

    expect(limiter.available("products")).toBe(2);
    await limiter.acquire("products");
    await limiter.acquire("products");
    expect(limiter.available("products")).toBe(0);

    // Third token isn't available yet — acquire must sleep until one refills.
    await limiter.acquire("products");
    expect(clock.sleeps.length).toBeGreaterThan(0);
  });

  it("caps refill at capacity", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(
      { ...DEFAULT_RATE_LIMITS, reports: { capacity: 3, refillPerSecond: 1 } },
      clock,
    );
    await limiter.acquire("reports");
    await limiter.acquire("reports");
    await limiter.acquire("reports");
    expect(limiter.available("reports")).toBe(0);

    clock.advance(100_000); // far more than capacity/refill
    expect(limiter.available("reports")).toBe(3);
  });

  it("keeps buckets independent per sub-API", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(
      {
        ...DEFAULT_RATE_LIMITS,
        products: { capacity: 1, refillPerSecond: 1 },
        accounts: { capacity: 1, refillPerSecond: 1 },
      },
      clock,
    );
    await limiter.acquire("products");
    expect(limiter.available("products")).toBe(0);
    expect(limiter.available("accounts")).toBe(1);
  });

  it("rejects a bucket config that would hang (capacity < 1 or refill <= 0)", () => {
    expect(
      () =>
        new RateLimiter({ ...DEFAULT_RATE_LIMITS, products: { capacity: 0, refillPerSecond: 1 } }),
    ).toThrow();
    expect(
      () =>
        new RateLimiter({ ...DEFAULT_RATE_LIMITS, products: { capacity: 1, refillPerSecond: 0 } }),
    ).toThrow();
  });
});
