import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Shared per-test stubs for the AccountsService methods.
const listAccounts = vi.fn();
const getAccount = vi.fn();
const getInfo = vi.fn();

// resolveAuth is mocked so the real core.createMerchantClient builds a (dummy)
// client without touching credentials; the Accounts service itself is stubbed.
vi.mock("@gmc-cli/auth", () => ({
  resolveAuth: vi.fn(async () => ({
    getAccessToken: async () => "tok",
    getClientEmail: () => "e",
    getProjectId: () => undefined,
  })),
}));

// Keep the real module (MerchantApiError, accountResourceName, ...) but swap the
// client + service for controllable doubles.
vi.mock("@gmc-cli/api", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/api")>();
  return {
    ...actual,
    MerchantClient: class {
      constructor(_options: unknown) {}
    },
    AccountsService: class {
      listAccounts = listAccounts;
      getAccount = getAccount;
      getInfo = getInfo;
    },
  };
});

import { createProgram } from "../src/program.js";
import { MerchantApiError } from "@gmc-cli/api";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc accounts", () => {
  let writes: string[];
  let errs: string[];
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-accounts-test-no-config");
    writes = [];
    errs = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      errs.push(String(chunk));
      return true;
    });
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

  it("list renders a human table of accessible accounts", async () => {
    listAccounts.mockResolvedValue([
      { name: "accounts/123", accountId: "123", accountName: "My Store" },
      { name: "accounts/987", accountId: "987", accountName: "Lab", testAccount: true },
    ]);

    await run(["accounts", "list"]);

    const out = writes.join("");
    expect(out).toContain("2 account(s):");
    expect(out).toContain("123");
    expect(out).toContain("My Store");
    expect(out).toContain("Lab (test)");
    expect(process.exitCode).toBe(0);
  });

  it("list --json emits an { accounts } envelope", async () => {
    listAccounts.mockResolvedValue([{ name: "accounts/123", accountId: "123" }]);

    await run(["accounts", "list", "--json"]);

    const out = JSON.parse(writes.join("")) as { accounts: { accountId: string }[] };
    expect(out.accounts).toHaveLength(1);
    expect(out.accounts[0]?.accountId).toBe("123");
    expect(process.exitCode).toBe(0);
  });

  it("get <id> --json emits the account resource and targets that id", async () => {
    getAccount.mockResolvedValue({ name: "accounts/123", accountId: "123", accountName: "My Store" });

    await run(["accounts", "get", "123", "--json"]);

    expect(getAccount).toHaveBeenCalledWith("123");
    const out = JSON.parse(writes.join("")) as { accountName: string };
    expect(out.accountName).toBe("My Store");
    expect(process.exitCode).toBe(0);
  });

  it("get falls back to the --account global when no id is passed", async () => {
    getAccount.mockResolvedValue({ name: "accounts/555", accountId: "555" });

    await run(["accounts", "get", "--account", "555"]);

    expect(getAccount).toHaveBeenCalledWith("555");
    expect(process.exitCode).toBe(0);
  });

  it("info renders the composite profile", async () => {
    getInfo.mockResolvedValue({
      account: { name: "accounts/123", accountId: "123", accountName: "My Store" },
      businessInfo: { name: "x", address: { addressLines: ["123 Main St"], regionCode: "US" } },
      homepage: { name: "h", uri: "https://mystore.com", claimed: true },
    });

    await run(["accounts", "info", "123"]);

    const out = writes.join("");
    expect(getInfo).toHaveBeenCalledWith("123");
    expect(out).toContain("My Store (123)");
    expect(out).toContain("https://mystore.com (claimed ✓)");
    expect(out).toContain("123 Main St, US");
    expect(process.exitCode).toBe(0);
  });

  it("exits 2 (usage) when no account id is available", async () => {
    await run(["accounts", "get"]);

    expect(getAccount).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("No Merchant Center account id");
    expect(process.exitCode).toBe(2);
  });

  it("exits 2 (usage) when the account id is not numeric", async () => {
    await run(["accounts", "get", "abc"]);

    expect(getAccount).not.toHaveBeenCalled();
    expect(errs.join("")).toContain('Invalid account id "abc"');
    expect(process.exitCode).toBe(2);
  });

  it("exits 5 when the Merchant API rejects the request", async () => {
    getAccount.mockRejectedValue(new MerchantApiError("Not found (404).", 404, "NOT_FOUND", false));

    await run(["accounts", "get", "123", "--json"]);

    const out = JSON.parse(writes.join("")) as { ok: boolean; error: { code?: string } };
    expect(out.ok).toBe(false);
    expect(process.exitCode).toBe(5);
  });
});
