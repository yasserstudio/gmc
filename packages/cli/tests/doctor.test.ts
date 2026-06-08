import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock the network/credential boundaries so the real core.runDoctor + CLI
// rendering run, but no credentials are read and no HTTP call happens.
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

import { createProgram } from "../src/program.js";
import { resolveAuth, AuthError } from "@gmc-cli/auth";
import { probeMerchantApi } from "@gmc-cli/api";

const mockResolve = vi.mocked(resolveAuth);
const mockProbe = vi.mocked(probeMerchantApi);

const client = {
  getAccessToken: async () => "tok",
  getClientEmail: () => "sa@demo.iam.gserviceaccount.com",
  getProjectId: () => "demo",
};

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc doctor", () => {
  let writes: string[];
  let savedEnv: Record<string, string | undefined>;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-doctor-test-no-config");
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

  it("exits 0 and reports ok on a healthy probe", async () => {
    mockResolve.mockResolvedValue(client);
    mockProbe.mockResolvedValue({ status: "pass", message: "reachable", accountCount: 1 });

    await run(["doctor", "--json"]);

    const out = JSON.parse(writes.join("")) as {
      ok: boolean;
      checks: { id: string; status: string }[];
    };
    expect(out.ok).toBe(true);
    expect(out.checks.find((c) => c.id === "merchant-api")?.status).toBe("pass");
    expect(process.exitCode).toBe(0);
  });

  it("exits 1 when the Merchant API probe fails", async () => {
    mockResolve.mockResolvedValue(client);
    mockProbe.mockResolvedValue({
      status: "fail",
      httpStatus: 403,
      message: "Permission denied (403).",
      suggestion: "register the project",
    });

    await run(["doctor", "--json"]);

    expect((JSON.parse(writes.join("")) as { ok: boolean }).ok).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("exits 3 (auth) with a credentials failure when auth cannot resolve", async () => {
    mockResolve.mockRejectedValue(new AuthError("No credentials found.", "AUTH_NO_CREDENTIALS"));

    await run(["doctor", "--json"]);

    const out = JSON.parse(writes.join("")) as { ok: boolean; checks: { id: string }[] };
    expect(out.ok).toBe(false);
    expect(out.checks[0]?.id).toBe("credentials");
    expect(mockProbe).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(3);
  });

  it("renders a human-readable report by default", async () => {
    mockResolve.mockResolvedValue(client);
    mockProbe.mockResolvedValue({ status: "pass", message: "reachable", accountCount: 1 });

    await run(["doctor"]);

    const out = writes.join("");
    expect(out).toContain("✓ Credentials resolved");
    expect(out).toContain("Merchant API access");
    expect(out).toContain("All checks passed.");
    expect(process.exitCode).toBe(0);
  });
});
