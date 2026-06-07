import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the auth package so no credentials are read and no network call happens.
// The mocked AuthError must be the same class the command imports, so that
// `err instanceof AuthError` in reportAuthError matches.
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

import { createProgram } from "../src/program.js";
import { resolveAuth, AuthError } from "@gmc-cli/auth";

const mockResolveAuth = vi.mocked(resolveAuth);

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc auth (JSON output)", () => {
  let writes: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it("whoami emits { ok: true, email, projectId } and exit 0 on success", async () => {
    mockResolveAuth.mockResolvedValue({
      getAccessToken: async () => "token",
      getClientEmail: () => "sa@demo.iam.gserviceaccount.com",
      getProjectId: () => "demo",
    });
    await run(["auth", "whoami", "--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({
      ok: true,
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
});
