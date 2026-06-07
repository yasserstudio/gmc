export interface AuthOptions {
  /** Path to a service-account JSON key file. */
  serviceAccountPath?: string;
  /** Raw service-account JSON (or a file path) — useful for env-var credentials. */
  serviceAccountJson?: string;
  /** Absolute directory for the on-disk token cache. Omit to skip disk caching. */
  cachePath?: string;
  /** OAuth scopes to request. Defaults to the Merchant API content scope. */
  scopes?: string[];
}

export interface AuthClient {
  /** Returns a valid bearer token, refreshing and caching as needed. */
  getAccessToken(): Promise<string>;
  /** GCP project id associated with the credential, if known. */
  getProjectId(): string | undefined;
  /** The authenticated principal (service-account email or an ADC-derived id). */
  getClientEmail(): string;
}

export interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}
