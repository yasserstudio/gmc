// Typed Conversions service (Merchant API `conversions/v1`,
// `accounts.conversionSources`). A conversion source links a merchant account to a
// conversion-measurement origin — either a Merchant Center destination or a Google
// Analytics property. Full CRUD plus `undelete`: `delete` soft-archives a source and
// `undelete` restores it. `create` returns an auto-generated id (no client-supplied id),
// and `update` carries an `updateMask` query param, mirroring the `notifications` /
// `regions` write shape. Sources live on the new "conversions" rate-limit bucket.
// Wraps a MerchantClient scoped to one account.

import type { MerchantClient } from "./client.js";

const CONVERSIONS_API = "conversions/v1";

// As elsewhere, these model only the fields the CLI reads/writes; the Merchant API
// accepts and returns more, and `client.get`/`request` round-trip the full JSON, so
// `--json` output and the bodies sent on create/update are never lossy.

/**
 * Attribution configuration shared by both source types. `attributionModel` is one of the
 * `*_CLICK` / `*_DATA_DRIVEN` / `*_LINEAR` … enum values; the rest round-trip via `--file`.
 */
export interface AttributionSettings {
  conversionType?: unknown[];
  attributionModel?: string;
  attributionLookbackWindowDays?: number;
}

/** A conversion source backed by a Merchant Center destination. */
export interface MerchantCenterDestination {
  /** Output-only: the Merchant Center destination id. */
  destination?: string;
  /** Human-readable name shown in Merchant Center. */
  displayName?: string;
  /** Required. Three-letter ISO 4217 currency code for reported conversion values. */
  currencyCode?: string;
  /** Writable attribution configuration. */
  attributionSettings?: AttributionSettings;
}

/** A conversion source backed by a Google Analytics property link. */
export interface GoogleAnalyticsLink {
  /** Output-only resource name of the linked GA property. */
  property?: string;
  /** Required, immutable. The Google Analytics property id. */
  propertyId?: string;
  /** Output-only attribution configuration (inherited from the GA property). */
  attributionSettings?: AttributionSettings;
}

/**
 * A conversion source (`accounts/{account}/conversionSources/{conversionSource}`). Exactly
 * one of `merchantCenterDestination` / `googleAnalyticsLink` is set (a union — fixed at
 * create, not switched on patch). `name`, `state`, `controller`, and `expireTime` are
 * output-only.
 */
export interface ConversionSource {
  /** Output-only resource name: `accounts/{account}/conversionSources/{id}`. */
  name?: string;
  /** Output-only: `ACTIVE` / `ARCHIVED` / `PENDING` / `STATE_UNSPECIFIED`. */
  state?: string;
  /** Output-only: who owns the source — `MERCHANT` / `YOUTUBE_AFFILIATES`. */
  controller?: string;
  /** Output-only: when an archived source is permanently removed. */
  expireTime?: string;
  merchantCenterDestination?: MerchantCenterDestination;
  googleAnalyticsLink?: GoogleAnalyticsLink;
}

/** The writable subset of a conversion source accepted on create / update. */
export type ConversionSourceInput = Pick<
  ConversionSource,
  "merchantCenterDestination" | "googleAnalyticsLink"
>;

/** One page of `conversionSources.list`. */
interface ConversionSourcesListPage {
  conversionSources?: ConversionSource[];
  nextPageToken?: string;
}

/**
 * Reduce a conversion-source id or full resource name to its bare id, mirroring
 * {@link notificationSegment}, so callers can pass either a bare id or the `name` from `list`.
 */
export function conversionSourceSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/conversionSources\//, "");
}

/** Full create/list/get/update/delete/undelete access to Merchant API conversion sources. */
export class ConversionsService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${CONVERSIONS_API}/${this.client.accountResource}/conversionSources`;
  }

  private resource(idOrName: string): string {
    return `${this.base}/${encodeURIComponent(conversionSourceSegment(idOrName))}`;
  }

  /** List every conversion source for the account, following pagination. */
  async listConversionSources(): Promise<ConversionSource[]> {
    const sources: ConversionSource[] = [];
    for await (const s of this.client.paginate<ConversionSource>("conversions", this.base, {
      select: (page) => (page as ConversionSourcesListPage).conversionSources ?? [],
    })) {
      sources.push(s);
    }
    return sources;
  }

  /** Fetch a single conversion source by id (or full resource name). */
  getConversionSource(idOrName: string): Promise<ConversionSource> {
    return this.client.get<ConversionSource>("conversions", this.resource(idOrName));
  }

  /** Create a conversion source. The id is auto-generated, so none is supplied. */
  createConversionSource(body: ConversionSourceInput): Promise<ConversionSource> {
    return this.client.post<ConversionSource>("conversions", this.base, body);
  }

  /**
   * Patch a conversion source. The `updateMask` defaults to the input's own keys, so only
   * what you pass is changed; pass `updateMask` to override (e.g. a nested
   * `merchantCenterDestination.displayName`). Mirrors `notifications.update`.
   */
  updateConversionSource(
    idOrName: string,
    body: ConversionSourceInput,
    opts: { updateMask?: string } = {},
  ): Promise<ConversionSource> {
    const updateMask = opts.updateMask ?? Object.keys(body).join(",");
    return this.client.request<ConversionSource>("conversions", "PATCH", this.resource(idOrName), {
      query: { updateMask },
      body,
    });
  }

  /** Soft-delete (archive) a conversion source by id. Restorable with {@link undeleteConversionSource}. */
  async deleteConversionSource(idOrName: string): Promise<void> {
    await this.client.delete<undefined>("conversions", this.resource(idOrName));
  }

  /** Re-enable a previously soft-deleted conversion source (`:undelete` colon-verb). */
  undeleteConversionSource(idOrName: string): Promise<ConversionSource> {
    return this.client.request<ConversionSource>(
      "conversions",
      "POST",
      `${this.resource(idOrName)}:undelete`,
      { body: {} },
    );
  }
}
