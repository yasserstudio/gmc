import type { AuthClient } from "@gmc-cli/auth";
import type { SubApi } from "./types.js";
import {
  RateLimiter,
  systemClock,
  type Clock,
  type RateLimitConfig,
  DEFAULT_RATE_LIMITS,
} from "./rate-limiter.js";
import { MerchantApiError } from "./errors.js";
import type { GoogleErrorBody } from "./google-error.js";

const DEFAULT_BASE_URL = "https://merchantapi.googleapis.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8_000;
const MAX_RETRY_AFTER_MS = 30_000;

export interface MerchantClientOptions {
  /** Authenticated client supplying bearer tokens. */
  auth: AuthClient;
  /**
   * Merchant Center account id (numeric). Optional: commands that don't target a
   * single account (e.g. `accounts list`) leave it unset. Reading
   * {@link MerchantClient.accountResource} without it throws.
   */
  accountId?: string;
  /** API base URL override (defaults to the Merchant API endpoint). */
  baseUrl?: string;
  /** Per-sub-API rate-limit overrides, merged over the defaults. */
  rateLimits?: Partial<RateLimitConfig>;
  /** Per-request timeout in ms (ignored when the caller passes its own signal). */
  timeoutMs?: number;
  /** Injectable clock (rate-limiter + retry backoff) — for testing. */
  clock?: Clock;
  /** Injectable fetch — for testing. */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

interface Page {
  nextPageToken?: string;
}

function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    // Only the delta-seconds form is honored; an HTTP-date falls back to backoff.
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
  }
  return backoffMs(attempt);
}

/**
 * Typed Merchant API client: routes every request through a per-sub-API rate
 * limiter, attaches a bearer token, maps errors to {@link MerchantApiError}, and
 * retries transient (429/5xx) failures with backoff.
 */
export class MerchantClient {
  private readonly auth: AuthClient;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  /** The Merchant Center account this client targets, if one was configured. */
  readonly accountId: string | undefined;

  constructor(options: MerchantClientOptions) {
    this.auth = options.auth;
    this.accountId = options.accountId;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.clock = options.clock ?? systemClock;
    this.limiter = new RateLimiter({ ...DEFAULT_RATE_LIMITS, ...options.rateLimits }, this.clock);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /** The `accounts/{id}` path segment most Merchant API resources hang off. */
  get accountResource(): string {
    if (!this.accountId) {
      throw new Error(
        "No Merchant Center account id configured. Pass --account, set GMC_ACCOUNT_ID, or select a profile with one.",
      );
    }
    return `accounts/${this.accountId}`;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    // Always resolve as a sub-path of baseUrl — never treat `path` as an absolute
    // URL, so an id/token-derived path can't redirect the bearer token off-origin.
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  /**
   * Make a typed request, rate-limited per sub-API, with retry on 408/429/5xx
   * and transient network errors. A 204 No Content resolves to `undefined`, so
   * type such calls as `void`/`undefined`.
   */
  async request<T>(
    subApi: SubApi,
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    await this.limiter.acquire(subApi);
    const url = this.buildUrl(path, opts.query);
    const hasBody = opts.body !== undefined;

    for (let attempt = 0; ; attempt++) {
      const token = await this.auth.getAccessToken();
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
            ...(hasBody ? { "content-type": "application/json" } : {}),
          },
          ...(hasBody ? { body: JSON.stringify(opts.body) } : {}),
          // Caller's signal wins; otherwise apply a default timeout so a hung
          // connection can't block forever.
          signal: opts.signal ?? AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (opts.signal?.aborted) throw err; // caller cancelled — don't retry
        if (attempt < MAX_RETRIES) {
          await this.clock.sleep(backoffMs(attempt));
          continue;
        }
        const timedOut = err instanceof Error && err.name === "TimeoutError";
        throw new MerchantApiError(
          `Merchant API request failed (network ${timedOut ? "timeout" : "error"}).`,
          0,
          "NETWORK_ERROR",
          true,
        );
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const body = (await res.json().catch(() => undefined)) as GoogleErrorBody | undefined;
      const err = MerchantApiError.fromResponse(res.status, body);
      if (err.retryable && attempt < MAX_RETRIES) {
        await this.clock.sleep(retryDelayMs(res, attempt));
        continue;
      }
      throw err;
    }
  }

  get<T>(subApi: SubApi, path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>(subApi, "GET", path, query ? { query } : {});
  }

  post<T>(subApi: SubApi, path: string, body: unknown): Promise<T> {
    return this.request<T>(subApi, "POST", path, { body });
  }

  delete<T>(subApi: SubApi, path: string): Promise<T> {
    return this.request<T>(subApi, "DELETE", path);
  }

  /**
   * Iterate every item across pages, following `nextPageToken`. `select` pulls
   * the item array out of each page response (field name varies by sub-API).
   */
  async *paginate<Item>(
    subApi: SubApi,
    path: string,
    opts: { query?: RequestOptions["query"]; select: (page: unknown) => Item[] },
  ): AsyncGenerator<Item> {
    let pageToken: string | undefined;
    do {
      const query = { ...opts.query, ...(pageToken ? { pageToken } : {}) };
      const page = await this.get<Page>(subApi, path, query);
      for (const item of opts.select(page)) {
        yield item;
      }
      const next = page.nextPageToken;
      // Guard against a server that echoes the same token forever.
      if (next && next === pageToken) {
        throw new Error("Merchant API pagination did not advance (repeated pageToken).");
      }
      pageToken = next;
    } while (pageToken);
  }
}
