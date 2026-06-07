import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadServiceAccountKey, createServiceAccountAuth } from "../src/service-account.js";
import { AuthError } from "../src/errors.js";
import { MERCHANT_API_SCOPE, DEFAULT_SCOPES } from "../src/scopes.js";

// Mock google-auth-library so no network/JWT signing happens and we can assert
// exactly which scopes are forwarded to the JWT client.
vi.mock("google-auth-library", () => ({
  JWT: vi.fn().mockImplementation(function (opts: unknown) {
    return { opts, getAccessToken: async () => ({ token: "fake-token" }) };
  }),
  GoogleAuth: vi.fn(),
}));

import { JWT } from "google-auth-library";

const validKey = JSON.stringify({
  type: "service_account",
  project_id: "demo-project",
  private_key_id: "abc",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
  client_email: "sa@demo-project.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadServiceAccountKey", () => {
  it("parses a valid service-account key from raw JSON", async () => {
    const key = await loadServiceAccountKey(validKey);
    expect(key.client_email).toBe("sa@demo-project.iam.gserviceaccount.com");
    expect(key.type).toBe("service_account");
  });

  it("rejects non-JSON input", async () => {
    await expect(loadServiceAccountKey("{not json")).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects a key missing required fields", async () => {
    const bad = JSON.stringify({ type: "service_account", client_email: "x@y.z" });
    await expect(loadServiceAccountKey(bad)).rejects.toMatchObject({ code: "AUTH_INVALID_KEY" });
  });

  it("rejects the wrong key type (e.g. an OAuth client)", async () => {
    const bad = JSON.stringify({
      type: "authorized_user",
      private_key: "x",
      client_email: "x@y.z",
    });
    await expect(loadServiceAccountKey(bad)).rejects.toMatchObject({ code: "AUTH_INVALID_KEY" });
  });

  it("reports a missing file as AUTH_FILE_NOT_FOUND", async () => {
    await expect(
      loadServiceAccountKey("/no/such/path/key-does-not-exist.json"),
    ).rejects.toMatchObject({ code: "AUTH_FILE_NOT_FOUND" });
  });
});

describe("scopes", () => {
  it("defaults to the Merchant API content scope", () => {
    expect(MERCHANT_API_SCOPE).toBe("https://www.googleapis.com/auth/content");
    expect(DEFAULT_SCOPES).toEqual([MERCHANT_API_SCOPE]);
  });
});

describe("createServiceAccountAuth", () => {
  it("builds a client exposing the key's identity without a network call", async () => {
    const key = await loadServiceAccountKey(validKey);
    const client = createServiceAccountAuth(key);
    expect(client.getClientEmail()).toBe("sa@demo-project.iam.gserviceaccount.com");
    expect(client.getProjectId()).toBe("demo-project");
  });

  it("defaults to the Merchant API scope when none is supplied", async () => {
    const key = await loadServiceAccountKey(validKey);
    createServiceAccountAuth(key);
    expect(JWT).toHaveBeenCalledWith(
      expect.objectContaining({ email: key.client_email, scopes: [...DEFAULT_SCOPES] }),
    );
  });

  it("forwards custom scopes to the JWT client", async () => {
    const key = await loadServiceAccountKey(validKey);
    const custom = [MERCHANT_API_SCOPE, "https://example.com/extra"];
    createServiceAccountAuth(key, { scopes: custom });
    expect(JWT).toHaveBeenCalledWith(expect.objectContaining({ scopes: custom }));
  });
});
