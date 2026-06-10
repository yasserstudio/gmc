import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock google-auth-library: createOAuthAuth constructs an OAuth2Client and
// drives setCredentials/getAccessToken. No network or real token refresh.
vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this["credentials"] = {} as Record<string, unknown>;
    this["setCredentials"] = (c: Record<string, unknown>) => {
      this["credentials"] = { ...(this["credentials"] as object), ...c };
    };
    this["getAccessToken"] = async () => {
      (this["credentials"] as Record<string, unknown>)["expiry_date"] = Date.now() + 3_600_000;
      return { token: "access-abc" };
    };
  }),
  JWT: vi.fn(),
  GoogleAuth: vi.fn(),
}));

import {
  parseClientSecretsJson,
  loadOAuthClientConfig,
  createOAuthAuth,
  deriveOAuthIdentity,
} from "../src/oauth.js";
import {
  saveStoredCredential,
  loadStoredCredential,
  clearStoredCredential,
  type StoredOAuthCredential,
} from "../src/oauth-store.js";
import { _resetMemoryCache } from "../src/token-cache.js";
import { AuthError } from "../src/errors.js";

const OAUTH_ENV = [
  "GMC_OAUTH_CLIENT_ID",
  "GMC_OAUTH_CLIENT_SECRET",
  "GMC_OAUTH_CLIENT_SECRETS",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  _resetMemoryCache();
  savedEnv = {};
  for (const key of OAUTH_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of OAUTH_ENV) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const sampleCredential: StoredOAuthCredential = {
  clientId: "cid.apps.googleusercontent.com",
  clientSecret: "secret",
  refreshToken: "refresh-token",
  email: "user@example.com",
  scopes: ["https://www.googleapis.com/auth/content"],
  createdAt: 1_700_000_000_000,
};

describe("parseClientSecretsJson", () => {
  it('parses the Desktop "installed" shape', () => {
    const raw = JSON.stringify({ installed: { client_id: "id-1", client_secret: "sec-1" } });
    expect(parseClientSecretsJson(raw)).toEqual({ clientId: "id-1", clientSecret: "sec-1" });
  });

  it('parses the "web" shape', () => {
    const raw = JSON.stringify({ web: { client_id: "id-2", client_secret: "sec-2" } });
    expect(parseClientSecretsJson(raw)).toEqual({ clientId: "id-2", clientSecret: "sec-2" });
  });

  it("rejects JSON missing client_id/client_secret", () => {
    expect(() => parseClientSecretsJson(JSON.stringify({ installed: {} }))).toThrow(AuthError);
  });

  it("rejects non-JSON", () => {
    expect(() => parseClientSecretsJson("not json")).toThrow(AuthError);
  });
});

describe("loadOAuthClientConfig", () => {
  it("prefers the GMC_OAUTH_CLIENT_ID/SECRET env vars", async () => {
    process.env["GMC_OAUTH_CLIENT_ID"] = "env-id";
    process.env["GMC_OAUTH_CLIENT_SECRET"] = "env-secret";
    await expect(loadOAuthClientConfig()).resolves.toEqual({
      clientId: "env-id",
      clientSecret: "env-secret",
    });
  });

  it("throws when client id is set without a secret", async () => {
    process.env["GMC_OAUTH_CLIENT_ID"] = "env-id";
    await expect(loadOAuthClientConfig()).rejects.toMatchObject({
      code: "AUTH_OAUTH_CLIENT_MISSING",
    });
  });

  it("reads a client_secret.json from GMC_OAUTH_CLIENT_SECRETS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gmc-oauth-"));
    try {
      const file = join(dir, "client_secret.json");
      await writeFile(
        file,
        JSON.stringify({ installed: { client_id: "f-id", client_secret: "f-sec" } }),
      );
      process.env["GMC_OAUTH_CLIENT_SECRETS"] = file;
      await expect(loadOAuthClientConfig()).resolves.toEqual({
        clientId: "f-id",
        clientSecret: "f-sec",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws when an explicit GMC_OAUTH_CLIENT_SECRETS path is missing", async () => {
    process.env["GMC_OAUTH_CLIENT_SECRETS"] = "/no/such/client_secret.json";
    await expect(loadOAuthClientConfig()).rejects.toMatchObject({
      code: "AUTH_OAUTH_CLIENT_MISSING",
    });
  });

  it("falls back to client_secret.json in the config dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gmc-oauth-"));
    try {
      await writeFile(
        join(dir, "client_secret.json"),
        JSON.stringify({ installed: { client_id: "d-id", client_secret: "d-sec" } }),
      );
      await expect(loadOAuthClientConfig(dir)).resolves.toEqual({
        clientId: "d-id",
        clientSecret: "d-sec",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws AUTH_OAUTH_CLIENT_MISSING when nothing is configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gmc-oauth-"));
    try {
      await expect(loadOAuthClientConfig(dir)).rejects.toMatchObject({
        code: "AUTH_OAUTH_CLIENT_MISSING",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("oauth credential store", () => {
  it("saves, loads, and clears a credential by profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gmc-store-"));
    try {
      expect(await loadStoredCredential(dir, "default")).toBeNull();

      await saveStoredCredential(dir, "default", sampleCredential);
      expect(await loadStoredCredential(dir, "default")).toEqual(sampleCredential);

      // A different profile is isolated.
      expect(await loadStoredCredential(dir, "staging")).toBeNull();

      expect(await clearStoredCredential(dir, "default")).toBe(true);
      expect(await loadStoredCredential(dir, "default")).toBeNull();
      // Clearing again reports nothing removed.
      expect(await clearStoredCredential(dir, "default")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes the store file with owner-only permissions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gmc-store-"));
    try {
      await saveStoredCredential(dir, "default", sampleCredential);
      const info = await stat(join(dir, "oauth-credentials.json"));
      expect(info.mode & 0o777).toBe(0o600);
      // Round-trips as valid JSON.
      const parsed = JSON.parse(await readFile(join(dir, "oauth-credentials.json"), "utf-8"));
      expect(parsed.default.email).toBe("user@example.com");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("deriveOAuthIdentity", () => {
  function idToken(payload: object): string {
    return `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
  }

  it("returns the email claim from the id_token when present", () => {
    expect(deriveOAuthIdentity(idToken({ email: "alice@example.com" }), "r1")).toBe(
      "alice@example.com",
    );
  });

  it("derives a stable, refresh-token-specific id when the email is absent", () => {
    const a = deriveOAuthIdentity(undefined, "refresh-a");
    const b = deriveOAuthIdentity(undefined, "refresh-b");
    expect(a).toMatch(/^oauth-[0-9a-f]{12}$/);
    expect(b).toMatch(/^oauth-[0-9a-f]{12}$/);
    // Different credentials must not collide on one cache key...
    expect(a).not.toBe(b);
    // ...but the same refresh token is deterministic.
    expect(deriveOAuthIdentity(undefined, "refresh-a")).toBe(a);
  });

  it("falls back to the derived id for a malformed id_token or empty email", () => {
    expect(deriveOAuthIdentity("not-a-jwt", "r")).toMatch(/^oauth-[0-9a-f]{12}$/);
    expect(deriveOAuthIdentity(idToken({ email: "" }), "r")).toMatch(/^oauth-[0-9a-f]{12}$/);
  });
});

describe("createOAuthAuth", () => {
  it("exposes the stored identity and no project id", () => {
    const client = createOAuthAuth(sampleCredential);
    expect(client.getClientEmail()).toBe("user@example.com");
    expect(client.getProjectId()).toBeUndefined();
  });

  it("mints an access token from the refresh credential", async () => {
    const client = createOAuthAuth(sampleCredential);
    await expect(client.getAccessToken()).resolves.toBe("access-abc");
  });
});
