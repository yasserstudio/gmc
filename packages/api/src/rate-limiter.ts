// Per-sub-API token-bucket rate limiter. The Merchant API meters quota per
// sub-API, so the client carries one independent bucket per sub-API (9 buckets)
// and acquires a token before every request to that sub-API.

import type { SubApi } from "./types.js";
import { SUB_APIS } from "./types.js";

/** Time source, injectable so the buckets are testable without real time. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface BucketConfig {
  /** Maximum burst, in tokens. */
  capacity: number;
  /** Sustained refill rate, in tokens per second. */
  refillPerSecond: number;
}

export type RateLimitConfig = Record<SubApi, BucketConfig>;

// Conservative client-side defaults — they smooth bursts rather than mirror
// Google's exact quota. Override per sub-API via MerchantClientOptions.rateLimits.
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  products: { capacity: 60, refillPerSecond: 10 },
  inventories: { capacity: 60, refillPerSecond: 10 },
  reports: { capacity: 30, refillPerSecond: 5 },
  accounts: { capacity: 30, refillPerSecond: 5 },
  datasources: { capacity: 30, refillPerSecond: 5 },
  promotions: { capacity: 30, refillPerSecond: 5 },
  notifications: { capacity: 30, refillPerSecond: 5 },
  quota: { capacity: 30, refillPerSecond: 5 },
  issueresolution: { capacity: 30, refillPerSecond: 5 },
  conversions: { capacity: 30, refillPerSecond: 5 },
};

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly clock: Clock,
  ) {
    // Reject configs that would make acquire() hang or busy-loop forever.
    if (!(capacity >= 1)) {
      throw new Error(`Rate-limit capacity must be >= 1 (got ${capacity}).`);
    }
    if (!(refillPerSecond > 0)) {
      throw new Error(`Rate-limit refillPerSecond must be > 0 (got ${refillPerSecond}).`);
    }
    this.tokens = capacity;
    this.lastRefill = clock.now();
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsedSeconds = Math.max(0, (now - this.lastRefill) / 1000);
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
  }

  /** Tokens currently available (after refill). For inspection/tests. */
  peek(): number {
    this.refill();
    return this.tokens;
  }

  async acquire(): Promise<void> {
    // Loop because sleep() may wake slightly early; refill and re-check.
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = Math.max(1, Math.ceil((deficit / this.refillPerSecond) * 1000));
      await this.clock.sleep(waitMs);
    }
  }
}

export class RateLimiter {
  private readonly buckets: Map<SubApi, TokenBucket>;

  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMITS, clock: Clock = systemClock) {
    this.buckets = new Map();
    for (const subApi of SUB_APIS) {
      const cfg = config[subApi];
      this.buckets.set(subApi, new TokenBucket(cfg.capacity, cfg.refillPerSecond, clock));
    }
  }

  /** Block until a token is available for the given sub-API. */
  acquire(subApi: SubApi): Promise<void> {
    const bucket = this.buckets.get(subApi);
    if (!bucket) {
      throw new Error(`No rate-limit bucket configured for sub-API: ${subApi}`);
    }
    return bucket.acquire();
  }

  /** Tokens currently available for a sub-API (for inspection/tests). */
  available(subApi: SubApi): number {
    return this.buckets.get(subApi)?.peek() ?? 0;
  }
}
