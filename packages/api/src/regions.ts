// Typed Regions service (Merchant API `accounts/v1`, `accounts.regions`). A region
// is a geographic area an account defines — by postal codes, geotarget criteria, or
// a radius — and then references from regional inventories and regional shipping
// rates. Full CRUD: list / get / create / patch / delete. Unlike the other write
// services, `create` takes the merchant-supplied id as a `regionId` query param
// (the body is the Region, like `productInputs:insert`), and `patch` carries an
// `updateMask` query param. Regions live under the Accounts sub-API, so this runs
// on the "accounts" rate-limit bucket. Wraps a MerchantClient scoped to one account.

import type { MerchantClient } from "./client.js";

const ACCOUNTS_API = "accounts/v1";

// As elsewhere, these model only the fields the CLI reads/writes; the Merchant API
// accepts and returns more, and `client.get`/`request` round-trip the full JSON, so
// `--json` output and the bodies sent on create/patch are never lossy.

/** A `[begin, end]` postal-code range (single code when `end` is omitted). */
export interface PostalCodeRange {
  /** First (or only) postal code in the range — required. */
  begin: string;
  /** Last postal code in the range; omit for a single code. */
  end?: string;
}

/** A region defined by a set of postal codes within one country. */
export interface PostalCodeArea {
  /** CLDR territory code the postal codes belong to (e.g. `US`). */
  regionCode: string;
  postalCodes: PostalCodeRange[];
}

/** A region defined by Google geotarget location criteria ids. */
export interface GeoTargetArea {
  geotargetCriteriaIds: string[];
}

/**
 * A geographic region (`accounts/{account}/regions/{region}`). A region is defined
 * by exactly one of `postalCodeArea` / `geotargetArea` (the API also supports a
 * radius area, which round-trips as JSON but the CLI doesn't model). `name` and the
 * two `*Eligible` flags are output-only.
 */
export interface Region {
  /** Output-only resource name: `accounts/{account}/regions/{region}`. */
  name?: string;
  displayName?: string;
  postalCodeArea?: PostalCodeArea;
  geotargetArea?: GeoTargetArea;
  /**
   * A radius-based area. The CLI passes this through from `--file` (it doesn't model
   * the inner fields), so it's typed loosely; declaring it keeps `--json` non-lossy
   * and lets the command type-check `radiusArea`-aware logic.
   */
  radiusArea?: unknown;
  /** Output-only: usable as a regional-inventory target. */
  regionalInventoryEligible?: boolean;
  /** Output-only: usable as a regional shipping-services target. */
  shippingEligible?: boolean;
}

/** The writable subset of a Region accepted on create / patch. */
export type RegionInput = Pick<
  Region,
  "displayName" | "postalCodeArea" | "geotargetArea" | "radiusArea"
>;

/** One page of `regions.list`. */
interface RegionsListPage {
  regions?: Region[];
  nextPageToken?: string;
}

/**
 * Reduce a region id or full resource name to its bare id, so callers can pass
 * either a bare id or the `name` returned by `list`.
 */
export function regionSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/regions\//, "");
}

/** Read and write access to the Merchant API Accounts `regions` sub-resource. */
export class RegionsService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${ACCOUNTS_API}/${this.client.accountResource}`;
  }

  /** Fetch a single region. Accepts a bare id or a full resource name. */
  getRegion(regionId: string): Promise<Region> {
    return this.client.get<Region>(
      "accounts",
      `${this.base}/regions/${encodeURIComponent(regionSegment(regionId))}`,
    );
  }

  /** List every region defined for the account, following pagination. */
  async listRegions(opts: { pageSize?: number } = {}): Promise<Region[]> {
    const regions: Region[] = [];
    for await (const r of this.client.paginate<Region>("accounts", `${this.base}/regions`, {
      ...(opts.pageSize ? { query: { pageSize: opts.pageSize } } : {}),
      select: (page) => (page as RegionsListPage).regions ?? [],
    })) {
      regions.push(r);
    }
    return regions;
  }

  /**
   * Create a region. The id is supplied as a `regionId` query param (the body is
   * the Region itself) — uses `client.request` directly to attach it, mirroring
   * `productInputs:insert`. Fails if a region with that id already exists.
   */
  createRegion(regionId: string, input: RegionInput): Promise<Region> {
    return this.client.request<Region>("accounts", "POST", `${this.base}/regions`, {
      query: { regionId },
      body: input,
    });
  }

  /**
   * Patch a region. The `updateMask` lists the fields to replace; when omitted it
   * defaults to the input's own top-level keys, so only what you pass is changed.
   * Uses `client.request` directly to attach the `updateMask` query param.
   */
  updateRegion(
    regionId: string,
    input: RegionInput,
    opts: { updateMask?: string } = {},
  ): Promise<Region> {
    const updateMask = opts.updateMask ?? Object.keys(input).join(",");
    return this.client.request<Region>(
      "accounts",
      "PATCH",
      `${this.base}/regions/${encodeURIComponent(regionSegment(regionId))}`,
      { query: { updateMask }, body: input },
    );
  }

  /** Delete a region by id. */
  async deleteRegion(regionId: string): Promise<void> {
    await this.client.delete<undefined>(
      "accounts",
      `${this.base}/regions/${encodeURIComponent(regionSegment(regionId))}`,
    );
  }
}
