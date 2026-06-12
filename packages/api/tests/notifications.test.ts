import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { NotificationsService, notificationSegment } from "../src/notifications.js";
import type { NotificationSubscriptionInput } from "../src/notifications.js";
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
  service: NotificationsService;
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
  const service = new NotificationsService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
  return { service, calls };
}

const BASE =
  "https://merchantapi.googleapis.com/notifications/v1/accounts/123/notificationsubscriptions";

describe("notificationSegment", () => {
  it("reduces a full resource name to its id", () => {
    expect(notificationSegment("accounts/123/notificationsubscriptions/abc")).toBe("abc");
    expect(notificationSegment("abc")).toBe("abc");
  });
});

describe("NotificationsService", () => {
  it("lists subscriptions, following pagination", async () => {
    let call = 0;
    const pages = [
      {
        notificationSubscriptions: [{ name: "accounts/123/notificationsubscriptions/a" }],
        nextPageToken: "t2",
      },
      { notificationSubscriptions: [{ name: "accounts/123/notificationsubscriptions/b" }] },
    ];
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;
    const service = new NotificationsService(
      new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
    );
    const list = await service.listNotifications();
    expect(list.map((s) => notificationSegment(s.name ?? ""))).toEqual(["a", "b"]);
    expect(urls[0]).toBe(BASE);
    expect(urls[1]).toContain("pageToken=t2");
  });

  it("gets a subscription, normalizing a full resource name", async () => {
    const { service, calls } = capturing({ name: "accounts/123/notificationsubscriptions/abc" });
    await service.getNotification("accounts/123/notificationsubscriptions/abc");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${BASE}/abc`);
  });

  it("creates a subscription by POSTing the body (no id in the path/query)", async () => {
    const { service, calls } = capturing({ name: "accounts/123/notificationsubscriptions/new" });
    const input: NotificationSubscriptionInput = {
      registeredEvent: "PRODUCT_STATUS_CHANGE",
      callBackUri: "https://example.com/hook",
      allManagedAccounts: true,
    };
    await service.createNotification(input);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(BASE);
    expect(calls[0]?.body).toEqual(input);
  });

  it("patches a subscription, defaulting updateMask to the input keys", async () => {
    const { service, calls } = capturing({});
    await service.updateNotification("abc", { callBackUri: "https://example.com/v2" });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(`${BASE}/abc?updateMask=callBackUri`);
    expect(calls[0]?.body).toEqual({ callBackUri: "https://example.com/v2" });
  });

  it("deletes a subscription by id", async () => {
    const { service, calls } = capturing(undefined, 204);
    await service.deleteNotification("abc");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(`${BASE}/abc`);
  });
});
