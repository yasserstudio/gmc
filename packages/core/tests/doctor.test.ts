import { describe, it, expect, vi, beforeEach } from "vitest";

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
  return { AuthError, resolveAuth: vi.fn() };
});

vi.mock("@gmc-cli/api", () => ({ probeMerchantApi: vi.fn() }));

import { runDoctor } from "../src/doctor.js";
import { resolveAuth, AuthError } from "@gmc-cli/auth";
import { probeMerchantApi } from "@gmc-cli/api";

const mockResolve = vi.mocked(resolveAuth);
const mockProbe = vi.mocked(probeMerchantApi);

function fakeClient(email: string, projectId: string | undefined) {
  return {
    getAccessToken: async () => "tok",
    getClientEmail: () => email,
    getProjectId: () => projectId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runDoctor", () => {
  it("reports a healthy setup with all checks passing", async () => {
    mockResolve.mockResolvedValue(fakeClient("sa@x.iam", "proj"));
    mockProbe.mockResolvedValue({ status: "pass", message: "reachable", accountCount: 1 });

    const r = await runDoctor({ configDir: "/tmp/x", profile: "default", accountId: "123" });

    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.checks.map((c) => c.id)).toEqual(["credentials", "token", "merchant-api"]);
    expect(r.identity).toEqual({ email: "sa@x.iam", projectId: "proj" });
    expect(r.accountId).toBe("123");
  });

  it("short-circuits when credentials cannot be resolved", async () => {
    mockResolve.mockRejectedValue(new AuthError("no creds", "AUTH_NO_CREDENTIALS", "do x"));

    const r = await runDoctor({ configDir: "/tmp/x", profile: "default" });

    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3); // auth failure → ExitCode.Auth
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0]).toMatchObject({ id: "credentials", status: "fail", suggestion: "do x" });
    expect(mockProbe).not.toHaveBeenCalled();
  });

  it("short-circuits when the access token cannot be minted", async () => {
    mockResolve.mockResolvedValue({
      getAccessToken: async () => {
        throw new AuthError("bad", "AUTH_TOKEN_FAILED");
      },
      getClientEmail: () => "e",
      getProjectId: () => undefined,
    });

    const r = await runDoctor({ configDir: "/tmp/x", profile: "default", accountId: "1" });

    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3); // token auth failure → ExitCode.Auth
    expect(r.checks.map((c) => c.id)).toEqual(["credentials", "token"]);
    expect(mockProbe).not.toHaveBeenCalled();
  });

  it("adds an account warning when no account id is configured", async () => {
    mockResolve.mockResolvedValue(fakeClient("e", undefined));
    mockProbe.mockResolvedValue({ status: "pass", message: "ok" });

    const r = await runDoctor({ configDir: "/tmp/x", profile: "default" });

    expect(r.checks.map((c) => c.id)).toEqual(["credentials", "token", "account", "merchant-api"]);
    expect(r.ok).toBe(true); // a warn does not fail the report
  });

  it("marks the report not-ok when the Merchant API probe fails", async () => {
    mockResolve.mockResolvedValue(fakeClient("e", "p"));
    mockProbe.mockResolvedValue({ status: "fail", message: "403", suggestion: "enable it" });

    const r = await runDoctor({ configDir: "/tmp/x", profile: "default", accountId: "1" });

    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1); // a probe failure is not an auth failure
    expect(r.checks.at(-1)).toMatchObject({ id: "merchant-api", status: "fail" });
  });
});
