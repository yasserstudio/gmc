import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

// Shared per-test stubs for the AccountsService methods.
const listAccounts = vi.fn();
const getAccount = vi.fn();
const getInfo = vi.fn();
const getHomepage = vi.fn();
const updateAccount = vi.fn();
const updateBusinessInfo = vi.fn();
const updateHomepage = vi.fn();
const claimHomepage = vi.fn();
const unclaimHomepage = vi.fn();
const listUsers = vi.fn();
const getUser = vi.fn();
const createUser = vi.fn();
const updateUser = vi.fn();
const deleteUser = vi.fn();
const createAccount = vi.fn();
const deleteAccount = vi.fn();
const getBusinessIdentity = vi.fn();
const updateBusinessIdentity = vi.fn();
const getAutofeedSettings = vi.fn();
const updateAutofeedSettings = vi.fn();
const getDeveloperRegistration = vi.fn();
const registerGcp = vi.fn();
const unregisterGcp = vi.fn();
const getShippingSettings = vi.fn();
const insertShippingSettings = vi.fn();
const listReturnPolicies = vi.fn();
const getReturnPolicy = vi.fn();
const createReturnPolicy = vi.fn();
const deleteReturnPolicy = vi.fn();

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
      getHomepage = getHomepage;
      updateAccount = updateAccount;
      updateBusinessInfo = updateBusinessInfo;
      updateHomepage = updateHomepage;
      claimHomepage = claimHomepage;
      unclaimHomepage = unclaimHomepage;
      listUsers = listUsers;
      getUser = getUser;
      createUser = createUser;
      updateUser = updateUser;
      deleteUser = deleteUser;
      createAccount = createAccount;
      deleteAccount = deleteAccount;
      getBusinessIdentity = getBusinessIdentity;
      updateBusinessIdentity = updateBusinessIdentity;
      getAutofeedSettings = getAutofeedSettings;
      updateAutofeedSettings = updateAutofeedSettings;
      getDeveloperRegistration = getDeveloperRegistration;
      registerGcp = registerGcp;
      unregisterGcp = unregisterGcp;
      getShippingSettings = getShippingSettings;
      insertShippingSettings = insertShippingSettings;
      listReturnPolicies = listReturnPolicies;
      getReturnPolicy = getReturnPolicy;
      createReturnPolicy = createReturnPolicy;
      deleteReturnPolicy = deleteReturnPolicy;
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
  let dir: string;
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
    dir = mkdtempSync(join(tmpdir(), "gmc-accounts-"));
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
    rmSync(dir, { recursive: true, force: true });
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
    getAccount.mockResolvedValue({
      name: "accounts/123",
      accountId: "123",
      accountName: "My Store",
    });

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

  it("update patches the account with the fields passed and confirms", async () => {
    updateAccount.mockResolvedValue({ name: "accounts/123", accountName: "Demo" });

    await run(["accounts", "update", "123", "--name", "Demo"]);

    expect(updateAccount).toHaveBeenCalledWith("123", { accountName: "Demo" }, {});
    expect(writes.join("")).toContain("Updated account 123.");
    expect(process.exitCode).toBe(0);
  });

  it("update parses --adult-content false into a boolean", async () => {
    updateAccount.mockResolvedValue({});

    await run(["accounts", "update", "123", "--adult-content", "false", "--time-zone", "UTC"]);

    expect(updateAccount).toHaveBeenCalledWith(
      "123",
      { adultContent: false, timeZone: { id: "UTC" } },
      {},
    );
  });

  it("update passes an explicit --update-mask through", async () => {
    updateAccount.mockResolvedValue({});

    await run(["accounts", "update", "123", "--name", "Demo", "--update-mask", "accountName"]);

    expect(updateAccount).toHaveBeenCalledWith(
      "123",
      { accountName: "Demo" },
      { updateMask: "accountName" },
    );
  });

  it("update rejects a no-op with no fields (exit 2)", async () => {
    await run(["accounts", "update", "123"]);

    expect(updateAccount).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("Nothing to update");
    expect(process.exitCode).toBe(2);
  });

  it("update rejects a non-boolean --adult-content (exit 2)", async () => {
    await run(["accounts", "update", "123", "--adult-content", "yes"]);

    expect(updateAccount).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("business-info update sets the Korean BRN", async () => {
    updateBusinessInfo.mockResolvedValue({ name: "accounts/123/businessInfo" });

    await run(["accounts", "business-info", "update", "123", "--korean-brn", "1234567890"]);

    expect(updateBusinessInfo).toHaveBeenCalledWith(
      "123",
      { koreanBusinessRegistrationNumber: "1234567890" },
      {},
    );
    expect(writes.join("")).toContain("Updated business info for account 123.");
  });

  it("business-info update strips output-only fields from a --file body", async () => {
    const file = join(dir, "bi.json");
    writeFileSync(
      file,
      JSON.stringify({
        name: "accounts/123/businessInfo",
        phone: { number: "+1" },
        phoneVerificationState: "PHONE_VERIFIED",
        address: { regionCode: "US" },
      }),
    );
    updateBusinessInfo.mockResolvedValue({});

    await run(["accounts", "business-info", "update", "123", "--file", file]);

    expect(updateBusinessInfo).toHaveBeenCalledWith("123", { address: { regionCode: "US" } }, {});
  });

  it("business-info update passes an explicit --update-mask through", async () => {
    updateBusinessInfo.mockResolvedValue({});

    await run([
      "accounts",
      "business-info",
      "update",
      "123",
      "--korean-brn",
      "1234567890",
      "--update-mask",
      "koreanBusinessRegistrationNumber",
    ]);

    expect(updateBusinessInfo).toHaveBeenCalledWith(
      "123",
      { koreanBusinessRegistrationNumber: "1234567890" },
      { updateMask: "koreanBusinessRegistrationNumber" },
    );
  });

  it("business-info update rejects a no-op (exit 2)", async () => {
    await run(["accounts", "business-info", "update", "123"]);

    expect(updateBusinessInfo).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("homepage set updates the URI", async () => {
    updateHomepage.mockResolvedValue({ uri: "https://x.com" });

    await run(["accounts", "homepage", "set", "https://x.com", "123"]);

    expect(updateHomepage).toHaveBeenCalledWith("123", { uri: "https://x.com" });
    expect(writes.join("")).toContain("Set homepage for account 123");
  });

  it("homepage claim --overwrite passes the flag; plain claim omits it", async () => {
    claimHomepage.mockResolvedValue({ claimed: true });

    await run(["accounts", "homepage", "claim", "123", "--overwrite"]);
    expect(claimHomepage).toHaveBeenCalledWith("123", { overwrite: true });

    await run(["accounts", "homepage", "claim", "123"]);
    expect(claimHomepage).toHaveBeenLastCalledWith("123", {});
  });

  it("homepage unclaim calls the service", async () => {
    unclaimHomepage.mockResolvedValue({ claimed: false });

    await run(["accounts", "homepage", "unclaim", "123"]);

    expect(unclaimHomepage).toHaveBeenCalledWith("123");
    expect(writes.join("")).toContain("Unclaimed homepage for account 123.");
  });

  it("homepage get renders the URI and claim status", async () => {
    getHomepage.mockResolvedValue({ name: "h", uri: "https://x.com", claimed: true });

    await run(["accounts", "homepage", "get", "123"]);

    expect(getHomepage).toHaveBeenCalledWith("123");
    const out = writes.join("");
    expect(out).toContain("https://x.com");
    expect(out).toContain("yes");
  });

  it("users list renders email, rights, and state", async () => {
    listUsers.mockResolvedValue([
      { name: "accounts/123/users/a@x.com", state: "VERIFIED", accessRights: ["ADMIN"] },
      { name: "accounts/123/users/b@x.com", state: "PENDING", accessRights: ["STANDARD"] },
    ]);

    await run(["accounts", "users", "list", "123"]);

    expect(listUsers).toHaveBeenCalledWith("123");
    const out = writes.join("");
    expect(out).toContain("2 user(s):");
    expect(out).toContain("a@x.com");
    expect(out).toContain("ADMIN");
    expect(out).toContain("[PENDING]");
  });

  it("users list --json emits a { users } envelope", async () => {
    listUsers.mockResolvedValue([{ name: "accounts/123/users/a@x.com" }]);

    await run(["-j", "accounts", "users", "list", "123"]);

    expect(JSON.parse(writes.join(""))).toEqual({
      users: [{ name: "accounts/123/users/a@x.com" }],
    });
  });

  it("users get fetches one user", async () => {
    getUser.mockResolvedValue({ name: "accounts/123/users/a@x.com", accessRights: ["ADMIN"] });

    await run(["accounts", "users", "get", "a@x.com", "123"]);

    expect(getUser).toHaveBeenCalledWith("123", "a@x.com");
    expect(writes.join("")).toContain("a@x.com");
  });

  it("users add parses --access-rights and confirms", async () => {
    createUser.mockResolvedValue({ name: "accounts/123/users/a@x.com" });

    await run(["accounts", "users", "add", "a@x.com", "123", "--access-rights", "admin, standard"]);

    expect(createUser).toHaveBeenCalledWith("123", "a@x.com", {
      accessRights: ["ADMIN", "STANDARD"],
    });
    expect(writes.join("")).toContain("Added user a@x.com to account 123.");
  });

  it("users add rejects an unknown access right (exit 2)", async () => {
    await run(["accounts", "users", "add", "a@x.com", "123", "--access-rights", "WIZARD"]);

    expect(createUser).not.toHaveBeenCalled();
    expect(errs.join("")).toContain('Invalid access right "WIZARD"');
    expect(process.exitCode).toBe(2);
  });

  it("users add requires --access-rights (exit 2)", async () => {
    await run(["accounts", "users", "add", "a@x.com", "123"]);

    expect(createUser).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("users update replaces the access rights", async () => {
    updateUser.mockResolvedValue({ name: "accounts/123/users/a@x.com" });

    await run(["accounts", "users", "update", "a@x.com", "123", "--access-rights", "ADMIN"]);

    expect(updateUser).toHaveBeenCalledWith("123", "a@x.com", { accessRights: ["ADMIN"] });
    expect(writes.join("")).toContain("Updated user a@x.com.");
  });

  it("users remove deletes a user and emits JSON", async () => {
    deleteUser.mockResolvedValue(undefined);

    await run(["-j", "accounts", "users", "remove", "accounts/123/users/a@x.com", "123"]);

    expect(deleteUser).toHaveBeenCalledWith("123", "accounts/123/users/a@x.com");
    expect(JSON.parse(writes.join(""))).toEqual({ removed: "a@x.com" });
  });

  it("create builds the request from flags + --aggregator", async () => {
    createAccount.mockResolvedValue({ name: "accounts/999", accountId: "999" });

    await run([
      "accounts",
      "create",
      "--name",
      "Sub",
      "--time-zone",
      "UTC",
      "--language",
      "en-US",
      "--aggregator",
      "123",
    ]);

    expect(createAccount).toHaveBeenCalledWith({
      account: { accountName: "Sub", timeZone: { id: "UTC" }, languageCode: "en-US" },
      service: [{ accountAggregation: {}, provider: "accounts/123" }],
    });
    expect(writes.join("")).toContain("Created account 999.");
  });

  it("create rejects a missing --name (exit 2)", async () => {
    await run(["accounts", "create", "--aggregator", "123"]);

    expect(createAccount).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("A new account needs a name");
    expect(process.exitCode).toBe(2);
  });

  it("create rejects no service relationship (exit 2)", async () => {
    await run(["accounts", "create", "--name", "Sub"]);

    expect(createAccount).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("needs a service relationship");
    expect(process.exitCode).toBe(2);
  });

  it("create merges --file with flags (file keeps user[], flags add the account name)", async () => {
    const file = join(dir, "req.json");
    writeFileSync(
      file,
      JSON.stringify({
        account: { timeZone: { id: "UTC" }, languageCode: "en-US" },
        service: [{ accountAggregation: {}, provider: "accounts/123" }],
        user: [{ userId: "a@x.com", user: { accessRights: ["ADMIN"] } }],
      }),
    );
    createAccount.mockResolvedValue({ accountId: "999" });

    await run(["accounts", "create", "--file", file, "--name", "Sub"]);

    expect(createAccount).toHaveBeenCalledWith({
      account: { timeZone: { id: "UTC" }, languageCode: "en-US", accountName: "Sub" },
      service: [{ accountAggregation: {}, provider: "accounts/123" }],
      user: [{ userId: "a@x.com", user: { accessRights: ["ADMIN"] } }],
    });
  });

  it("delete refuses without --yes (exit 2) and never calls the API", async () => {
    await run(["accounts", "delete", "123"]);

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("without --yes");
    expect(process.exitCode).toBe(2);
  });

  it("delete with --yes calls the service and confirms", async () => {
    deleteAccount.mockResolvedValue(undefined);

    await run(["accounts", "delete", "123", "--yes"]);

    expect(deleteAccount).toHaveBeenCalledWith("123", {});
    expect(writes.join("")).toContain("Deleted account 123.");
  });

  it("delete --force forwards force; --json emits { deleted }", async () => {
    deleteAccount.mockResolvedValue(undefined);

    await run(["-j", "accounts", "delete", "123", "--yes", "--force"]);

    expect(deleteAccount).toHaveBeenCalledWith("123", { force: true });
    expect(JSON.parse(writes.join(""))).toEqual({ deleted: "123" });
  });

  it("business-identity update maps --small-business yes to SELF_IDENTIFIES_AS", async () => {
    updateBusinessIdentity.mockResolvedValue({});

    await run([
      "accounts",
      "business-identity",
      "update",
      "123",
      "--small-business",
      "yes",
      "--promotions-consent",
      "given",
    ]);

    expect(updateBusinessIdentity).toHaveBeenCalledWith(
      "123",
      {
        promotionsConsent: "PROMOTIONS_CONSENT_GIVEN",
        smallBusiness: { identityDeclaration: "SELF_IDENTIFIES_AS" },
      },
      {},
    );
  });

  it("business-identity update rejects a bad identity value (exit 2)", async () => {
    await run(["accounts", "business-identity", "update", "123", "--women-owned", "maybe"]);

    expect(updateBusinessIdentity).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("business-identity update rejects a no-op (exit 2)", async () => {
    await run(["accounts", "business-identity", "update", "123"]);

    expect(updateBusinessIdentity).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("Nothing to update");
    expect(process.exitCode).toBe(2);
  });

  it("business-identity get renders attribute labels", async () => {
    getBusinessIdentity.mockResolvedValue({
      smallBusiness: { identityDeclaration: "SELF_IDENTIFIES_AS" },
      womenOwned: { identityDeclaration: "DOES_NOT_SELF_IDENTIFY_AS" },
    });

    await run(["accounts", "business-identity", "get", "123"]);

    const out = writes.join("");
    expect(out).toContain("Small business");
    expect(out).toContain("yes");
    expect(out).toContain("no");
  });

  it("autofeed update parses --enable-products false", async () => {
    updateAutofeedSettings.mockResolvedValue({});

    await run(["accounts", "autofeed", "update", "123", "--enable-products", "false"]);

    expect(updateAutofeedSettings).toHaveBeenCalledWith("123", { enableProducts: false }, {});
  });

  it("autofeed get renders enable/eligible", async () => {
    getAutofeedSettings.mockResolvedValue({ enableProducts: true, eligible: false });

    await run(["accounts", "autofeed", "get", "123"]);

    const out = writes.join("");
    expect(out).toContain("Enable products");
    expect(out).toContain("Eligible");
  });

  it("developer-registration register passes --developer-email; omits it otherwise", async () => {
    registerGcp.mockResolvedValue(undefined);

    await run([
      "accounts",
      "developer-registration",
      "register",
      "123",
      "--developer-email",
      "dev@x.com",
    ]);
    expect(registerGcp).toHaveBeenCalledWith("123", { developerEmail: "dev@x.com" });
    expect(writes.join("")).toContain("Registered the Cloud project with account 123.");

    await run(["accounts", "developer-registration", "register", "123"]);
    expect(registerGcp).toHaveBeenLastCalledWith("123", {});
  });

  it("developer-registration get renders the registered project ids", async () => {
    getDeveloperRegistration.mockResolvedValue({
      name: "accounts/123/developerRegistration",
      gcpIds: ["999"],
    });

    await run(["accounts", "developer-registration", "get", "123"]);

    const out = writes.join("");
    expect(out).toContain("1 registered Cloud project(s):");
    expect(out).toContain("999");
  });

  it("developer-registration get --json emits the resource", async () => {
    getDeveloperRegistration.mockResolvedValue({
      name: "accounts/123/developerRegistration",
      gcpIds: ["999"],
    });

    await run(["accounts", "developer-registration", "get", "123", "--json"]);

    expect(JSON.parse(writes.join(""))).toEqual({
      name: "accounts/123/developerRegistration",
      gcpIds: ["999"],
    });
  });

  it("developer-registration unregister refuses without --yes, then calls the service", async () => {
    await run(["accounts", "developer-registration", "unregister", "123"]);
    expect(unregisterGcp).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);

    process.exitCode = 0;
    unregisterGcp.mockResolvedValue(undefined);
    await run(["accounts", "developer-registration", "unregister", "123", "--yes"]);
    expect(unregisterGcp).toHaveBeenCalledWith("123");
    expect(writes.join("")).toContain("Unregistered the Cloud project from account 123.");
  });

  it("shipping set sends the --file body whole (etag preserved)", async () => {
    const file = join(dir, "ship.json");
    writeFileSync(file, JSON.stringify({ etag: "abc", services: [{ serviceName: "s" }] }));
    insertShippingSettings.mockResolvedValue({ etag: "def" });

    await run(["accounts", "shipping", "set", "123", "--file", file]);

    expect(insertShippingSettings).toHaveBeenCalledWith("123", {
      etag: "abc",
      services: [{ serviceName: "s" }],
    });
    expect(writes.join("")).toContain("Replaced shipping settings");
  });

  it("return-policies list renders id · countries", async () => {
    listReturnPolicies.mockResolvedValue([
      { name: "accounts/123/onlineReturnPolicies/rp1", label: "default", countries: ["US", "CA"] },
    ]);

    await run(["accounts", "return-policies", "list", "123"]);

    const out = writes.join("");
    expect(out).toContain("rp1");
    expect(out).toContain("US, CA");
  });

  it("return-policies create posts the --file body and reports the id", async () => {
    const file = join(dir, "rp.json");
    writeFileSync(file, JSON.stringify({ label: "default", countries: ["US"] }));
    createReturnPolicy.mockResolvedValue({ returnPolicyId: "rp9" });

    await run(["accounts", "return-policies", "create", "123", "--file", file]);

    expect(createReturnPolicy).toHaveBeenCalledWith("123", { label: "default", countries: ["US"] });
    expect(writes.join("")).toContain("Created return policy rp9.");
  });

  it("return-policies delete emits { deleted }", async () => {
    deleteReturnPolicy.mockResolvedValue(undefined);

    await run([
      "-j",
      "accounts",
      "return-policies",
      "delete",
      "accounts/123/onlineReturnPolicies/rp1",
      "123",
    ]);

    expect(deleteReturnPolicy).toHaveBeenCalledWith("123", "accounts/123/onlineReturnPolicies/rp1");
    expect(JSON.parse(writes.join(""))).toEqual({ deleted: "rp1" });
  });
});
