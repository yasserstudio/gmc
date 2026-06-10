import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock the auth package so no credentials are read and no network call happens.
// The mocked AuthError carries a numeric `exitCode`, so core.reportError's
// structural `isStructuredError` check treats it as a domain error (exit 3).
vi.mock("@gmc-cli/auth", () => {
  class AuthError extends Error {
    public readonly exitCode = 3;
    constructor(
      message: string,
      public readonly code: string,
      public readonly suggestion?: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }
  return {
    AuthError,
    resolveAuth: vi.fn(),
    loginWithOAuth: vi.fn(),
    loadStoredCredential: vi.fn(),
    clearStoredCredential: vi.fn(),
    clearTokenCache: vi.fn(),
    DEFAULT_PROFILE: "default",
  };
});

import { createProgram } from "../src/program.js";
import {
  resolveAuth,
  loginWithOAuth,
  loadStoredCredential,
  clearStoredCredential,
  clearTokenCache,
  AuthError,
} from "@gmc-cli/auth";

const mockResolveAuth = vi.mocked(resolveAuth);
const mockLogin = vi.mocked(loginWithOAuth);
const mockLoadStored = vi.mocked(loadStoredCredential);
const mockClearStored = vi.mocked(clearStoredCredential);
const mockClearTokenCache = vi.mocked(clearTokenCache);

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc auth (JSON output)", () => {
  let writes: string[];
  let savedEnv: Record<string, string | undefined>;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    // Isolate config resolution (contextFrom -> loadConfig) from the host: point
    // at an empty dir and clear profile env so the profile resolves to "default".
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-auth-test-no-config");
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = 0;
  });

  it("whoami emits a bare { email, projectId } payload and exit 0 on success", async () => {
    mockResolveAuth.mockResolvedValue({
      getAccessToken: async () => "token",
      getClientEmail: () => "sa@demo.iam.gserviceaccount.com",
      getProjectId: () => "demo",
    });
    await run(["auth", "whoami", "--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({
      email: "sa@demo.iam.gserviceaccount.com",
      projectId: "demo",
    });
    expect(process.exitCode).toBe(0);
  });

  it("emits a consistent { ok: false, error } envelope and exit 3 on AuthError", async () => {
    mockResolveAuth.mockRejectedValue(
      new AuthError("No credentials found.", "AUTH_NO_CREDENTIALS", "Run gcloud auth ..."),
    );
    await run(["auth", "whoami", "--json"]);
    const out = JSON.parse(writes.join("")) as { ok: boolean; error: { code: string } };
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("AUTH_NO_CREDENTIALS");
    expect(process.exitCode).toBe(3);
  });

  it("test surfaces a token failure as exit 3", async () => {
    mockResolveAuth.mockResolvedValue({
      getAccessToken: async () => {
        throw new AuthError("Token response was empty.", "AUTH_TOKEN_FAILED");
      },
      getClientEmail: () => "sa@demo.iam.gserviceaccount.com",
      getProjectId: () => "demo",
    });
    await run(["auth", "test", "--json"]);
    const out = JSON.parse(writes.join("")) as { ok: boolean; error: { code: string } };
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("AUTH_TOKEN_FAILED");
    expect(process.exitCode).toBe(3);
  });

  it("login emits a bare { email, projectId } payload and exit 0 on success", async () => {
    mockLogin.mockResolvedValue({
      clientId: "cid",
      clientSecret: "sec",
      refreshToken: "r",
      email: "user@example.com",
      scopes: [],
      createdAt: 0,
    });
    await run(["auth", "login", "--no-browser", "--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({
      email: "user@example.com",
      projectId: null,
    });
    expect(process.exitCode).toBe(0);
  });

  it("login surfaces a missing OAuth client as exit 3", async () => {
    mockLogin.mockRejectedValue(
      new AuthError("No OAuth client credentials found.", "AUTH_OAUTH_CLIENT_MISSING", "..."),
    );
    await run(["auth", "login", "--no-browser", "--json"]);
    const out = JSON.parse(writes.join("")) as { ok: boolean; error: { code: string } };
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("AUTH_OAUTH_CLIENT_MISSING");
    expect(process.exitCode).toBe(3);
  });

  it("logout reports removal and clears the token cache for the user", async () => {
    mockLoadStored.mockResolvedValue({
      clientId: "cid",
      clientSecret: "sec",
      refreshToken: "r",
      email: "user@example.com",
      scopes: [],
      createdAt: 0,
    });
    mockClearStored.mockResolvedValue(true);
    mockClearTokenCache.mockResolvedValue(undefined);
    await run(["auth", "logout", "--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({ removed: true, profile: "default" });
    expect(mockClearTokenCache).toHaveBeenCalledWith(expect.any(String), "user@example.com");
    expect(process.exitCode).toBe(0);
  });

  it("logout reports removed: false and skips cache clear when nothing is stored", async () => {
    mockLoadStored.mockResolvedValue(null);
    mockClearStored.mockResolvedValue(false);
    await run(["auth", "logout", "--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({ removed: false, profile: "default" });
    expect(mockClearTokenCache).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });
});
