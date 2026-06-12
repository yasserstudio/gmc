// Typed Notifications service (Merchant API `notifications/v1`,
// `accounts.notificationsubscriptions`). A subscription registers a webhook
// `callBackUri` that receives an HTTP POST when a registered event (currently only
// product-status changes) fires — for one target account or all managed accounts.
// Full CRUD: list / get / create / update / delete. `create` returns an auto-generated
// id (no client-supplied id), and `update` carries an `updateMask` query param, mirroring
// the `regions` write shape. Subscriptions live on the new "notifications" rate-limit
// bucket. Wraps a MerchantClient scoped to one account.

import type { MerchantClient } from "./client.js";

const NOTIFICATIONS_API = "notifications/v1";

// As elsewhere, these model only the fields the CLI reads/writes; the Merchant API
// accepts and returns more, and `client.get`/`request` round-trip the full JSON, so
// `--json` output and the bodies sent on create/update are never lossy.

/** The event a subscription registers for. Currently the API exposes one. */
export type RegisteredEvent = "PRODUCT_STATUS_CHANGE";

/**
 * A webhook notification subscription
 * (`accounts/{account}/notificationsubscriptions/{subscription}`). Delivery is an HTTP
 * POST to `callBackUri` — not Pub/Sub. Exactly one of `allManagedAccounts` /
 * `targetAccount` is set (a union). `name` is output-only (the id is auto-generated).
 */
export interface NotificationSubscription {
  /** Output-only resource name: `accounts/{account}/notificationsubscriptions/{id}`. */
  name?: string;
  registeredEvent?: RegisteredEvent;
  /** The webhook URL that receives notifications (HTTPS). */
  callBackUri?: string;
  /** Subscribe for every managed account (advanced accounts) — union with `targetAccount`. */
  allManagedAccounts?: boolean;
  /** Subscribe for one account (`accounts/{id}`) — union with `allManagedAccounts`. */
  targetAccount?: string;
}

/** The writable subset of a subscription accepted on create / update. */
export type NotificationSubscriptionInput = Pick<
  NotificationSubscription,
  "registeredEvent" | "callBackUri" | "allManagedAccounts" | "targetAccount"
>;

/** One page of `notificationsubscriptions.list`. */
interface NotificationsListPage {
  notificationSubscriptions?: NotificationSubscription[];
  nextPageToken?: string;
}

/**
 * Reduce a subscription id or full resource name to its bare id, mirroring
 * {@link regionSegment}, so callers can pass either a bare id or the `name` from `list`.
 */
export function notificationSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/notificationsubscriptions\//, "");
}

/** Full create/list/get/update/delete access to the Merchant API notification subscriptions. */
export class NotificationsService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${NOTIFICATIONS_API}/${this.client.accountResource}/notificationsubscriptions`;
  }

  /** List every notification subscription for the account, following pagination. */
  async listNotifications(): Promise<NotificationSubscription[]> {
    const subs: NotificationSubscription[] = [];
    for await (const s of this.client.paginate<NotificationSubscription>(
      "notifications",
      this.base,
      { select: (page) => (page as NotificationsListPage).notificationSubscriptions ?? [] },
    )) {
      subs.push(s);
    }
    return subs;
  }

  /** Fetch a single subscription by id (or full resource name). */
  getNotification(idOrName: string): Promise<NotificationSubscription> {
    return this.client.get<NotificationSubscription>(
      "notifications",
      `${this.base}/${encodeURIComponent(notificationSegment(idOrName))}`,
    );
  }

  /** Create a subscription. The id is auto-generated, so none is supplied. */
  createNotification(body: NotificationSubscriptionInput): Promise<NotificationSubscription> {
    return this.client.post<NotificationSubscription>("notifications", this.base, body);
  }

  /**
   * Patch a subscription. The `updateMask` defaults to the input's own keys, so only what
   * you pass is changed; pass `updateMask` to override. Mirrors `regions.patch`.
   */
  updateNotification(
    idOrName: string,
    body: NotificationSubscriptionInput,
    opts: { updateMask?: string } = {},
  ): Promise<NotificationSubscription> {
    const updateMask = opts.updateMask ?? Object.keys(body).join(",");
    return this.client.request<NotificationSubscription>(
      "notifications",
      "PATCH",
      `${this.base}/${encodeURIComponent(notificationSegment(idOrName))}`,
      { query: { updateMask }, body },
    );
  }

  /** Delete a subscription by id. */
  async deleteNotification(idOrName: string): Promise<void> {
    await this.client.delete<undefined>(
      "notifications",
      `${this.base}/${encodeURIComponent(notificationSegment(idOrName))}`,
    );
  }
}
