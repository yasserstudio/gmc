import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { resolveAuth, manage } = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  manage: vi.fn(),
}));

vi.mock("@gmc-cli/auth", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/auth")>();
  return { ...actual, resolveAuth };
});

vi.mock("@gmc-cli/api", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/api")>();
  return {
    ...actual,
    MerchantClient: class {
      constructor(_options: unknown) {}
    },
    LoyaltyCustomersService: class {
      manage = manage;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc loyalty-customers", () => {
  let dir: string;
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-loyalty-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-loyalty-"));
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    resolveAuth.mockResolvedValue({
      getAccessToken: async () => "tok",
      getClientEmail: () => "e",
      getProjectId: () => undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    for (const key of ENV) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("wraps a LoyaltyCustomer file and never prints its identifier in human output", async () => {
    const file = join(dir, "customer.json");
    writeFileSync(
      file,
      JSON.stringify({
        userIdentifier: { emailAddress: "member@example.com" },
        loyaltyTier: "TIER3",
        pointBalance: "900",
      }),
    );
    manage.mockResolvedValue({ loyaltyCustomer: { loyaltyTier: "TIER3" } });

    await run(["loyalty-customers", "manage", "--file", file]);

    expect(manage).toHaveBeenCalledWith({
      loyaltyCustomer: {
        userIdentifier: { emailAddress: "member@example.com" },
        loyaltyTier: "TIER3",
        pointBalance: "900",
      },
    });
    expect(writes.join("")).toContain("request accepted");
    expect(writes.join("")).not.toContain("member@example.com");
  });

  it("accepts NON_MEMBER removal and emits the response only with --json", async () => {
    const file = join(dir, "remove.json");
    writeFileSync(
      file,
      JSON.stringify({
        loyaltyCustomer: {
          userIdentifier: { phoneNumber: "+16502530000" },
          loyaltyTier: "NON_MEMBER",
        },
      }),
    );
    manage.mockResolvedValue({ loyaltyCustomer: { loyaltyTier: "NON_MEMBER" } });

    await run(["--json", "loyalty", "manage", "--file", file]);

    expect(JSON.parse(writes.join(""))).toEqual({ loyaltyCustomer: { loyaltyTier: "NON_MEMBER" } });
  });

  it("rejects a request without an identifier before authentication", async () => {
    const file = join(dir, "invalid.json");
    writeFileSync(file, JSON.stringify({ loyaltyTier: "TIER1" }));

    await run(["loyalty-customers", "manage", "--file", file]);

    expect(resolveAuth).not.toHaveBeenCalled();
    expect(manage).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });
});
