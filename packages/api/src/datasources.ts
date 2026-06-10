// Typed Data Sources sub-API service (Merchant API `datasources/v1`). A data
// source is the container a product feed lives in — a primary product source can
// receive products via the API (what `productInputs.insert` targets) or via a
// scheduled file fetch. This service wraps a MerchantClient scoped to one account
// (it reads `client.accountResource`) and covers the create/list/get/delete
// lifecycle. v0.9+ (feeds) build on it.

import type { MerchantClient } from "./client.js";

const DATASOURCES_API = "datasources/v1";

// The interfaces below model only the fields the CLI reads/writes; the Merchant
// API returns and accepts more. `client.get`/`post` round-trip the full JSON —
// these types are a compile-time view, not a runtime filter.

/** A primary product data source config (`channel`/`feedLabel`/`contentLanguage`). */
export interface PrimaryProductDataSource {
  channel?: string;
  feedLabel?: string;
  contentLanguage?: string;
  countries?: string[];
}

/** Scheduled-fetch settings for a file-based data source. */
export interface FetchSettings {
  enabled?: boolean;
  fetchUri?: string;
  frequency?: string;
  dayOfMonth?: number;
  dayOfWeek?: string;
  timeOfDay?: { hours?: number; minutes?: number };
  timeZone?: string;
  username?: string;
  password?: string;
}

/** File-input config (scheduled fetch or upload) for a data source. */
export interface FileInput {
  fetchSettings?: FetchSettings;
  fileName?: string;
  fileInputType?: string;
}

/** A Merchant Center data source (`accounts/{account}/dataSources/{datasource}`). */
export interface DataSource {
  name?: string;
  dataSourceId?: string;
  displayName?: string;
  /** Derived input mode: "API" | "FILE" | "AUTOFEED" | "FILE_UPLOAD". */
  input?: string;
  primaryProductDataSource?: PrimaryProductDataSource;
  // The other source types are opaque here — only their presence is read (for
  // `dataSourceType` detection); pass them through as JSON via `--file`.
  supplementalProductDataSource?: Record<string, unknown>;
  localInventoryDataSource?: Record<string, unknown>;
  regionalInventoryDataSource?: Record<string, unknown>;
  promotionDataSource?: Record<string, unknown>;
  fileInput?: FileInput;
}

/** One page of `dataSources.list`. */
interface DataSourcesListPage {
  dataSources?: DataSource[];
  nextPageToken?: string;
}

/**
 * Reduce a data source id or full resource name to the bare id, so `get`/`delete`
 * accept either a bare id or the `name` returned by `list`.
 */
export function dataSourceSegment(idOrName: string): string {
  return idOrName.replace(/^.*\/dataSources\//, "");
}

/** Create, list, get, and delete access to the Merchant API Data Sources sub-API. */
export class DataSourcesService {
  constructor(private readonly client: MerchantClient) {}

  private get base(): string {
    return `${DATASOURCES_API}/${this.client.accountResource}`;
  }

  /** Fetch a single data source. */
  getDataSource(idOrName: string): Promise<DataSource> {
    return this.client.get<DataSource>(
      "datasources",
      `${this.base}/dataSources/${encodeURIComponent(dataSourceSegment(idOrName))}`,
    );
  }

  /** List every data source for the account, following pagination. */
  async listDataSources(): Promise<DataSource[]> {
    const dataSources: DataSource[] = [];
    for await (const ds of this.client.paginate<DataSource>("datasources", `${this.base}/dataSources`, {
      select: (page) => (page as DataSourcesListPage).dataSources ?? [],
    })) {
      dataSources.push(ds);
    }
    return dataSources;
  }

  /** Create a data source from a full DataSource body. */
  createDataSource(body: DataSource): Promise<DataSource> {
    return this.client.post<DataSource>("datasources", `${this.base}/dataSources`, body);
  }

  /** Delete a data source. */
  async deleteDataSource(idOrName: string): Promise<void> {
    await this.client.delete<undefined>(
      "datasources",
      `${this.base}/dataSources/${encodeURIComponent(dataSourceSegment(idOrName))}`,
    );
  }
}
