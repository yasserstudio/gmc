import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  resolveAuth,
  listNotifications,
  getNotification,
  createNotification,
  updateNotification,
  deleteNotification,
} = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  listNotifications: vi.fn(),
  getNotification: vi.fn(),
  createNotification: vi.fn(),
  updateNotification: vi.fn(),
  deleteNotification: vi.fn(),
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
      constructor(_o: unknown) {}
    },
    NotificationsService: class {
      listNotifications = listNotifications;
      getNotification = getNotification;
      createNotification = createNotification;
      updateNotification = updateNotification;
      deleteNotification = deleteNotification;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc notifications", () => {
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-notifications-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "123";
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      writes.push(String(c));
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
    for (const key of ENV) {
      const v = savedEnv[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  const out = (): string => writes.join("");

  it("lists subscriptions with a summary", async () => {
    listNotifications.mockResolvedValue([
      {
        name: "accounts/123/notificationsubscriptions/abc",
        registeredEvent: "PRODUCT_STATUS_CHANGE",
        allManagedAccounts: true,
        callBackUri: "https://example.com/hook",
      },
    ]);
    await run(["notifications", "list"]);
    expect(out()).toContain("1 subscription(s)");
    expect(out()).toContain("abc");
    expect(out()).toContain("all-managed");
    expect(out()).toContain("https://example.com/hook");
  });

  it("emits JSON for list", async () => {
    listNotifications.mockResolvedValue([{ name: "accounts/123/notificationsubscriptions/abc" }]);
    await run(["-j", "notifications", "list"]);
    expect(JSON.parse(out())).toEqual({
      notifications: [{ name: "accounts/123/notificationsubscriptions/abc" }],
    });
  });

  it("gets one subscription", async () => {
    getNotification.mockResolvedValue({
      name: "accounts/123/notificationsubscriptions/abc",
      registeredEvent: "PRODUCT_STATUS_CHANGE",
      targetAccount: "accounts/999",
    });
    await run(["notifications", "get", "abc"]);
    expect(getNotification).toHaveBeenCalledWith("abc");
    expect(out()).toContain("accounts/999");
  });

  it("creates from --callback-uri + --all-managed-accounts (event defaults)", async () => {
    createNotification.mockResolvedValue({ name: "accounts/123/notificationsubscriptions/new" });
    await run([
      "notifications",
      "create",
      "--callback-uri",
      "https://example.com/hook",
      "--all-managed-accounts",
    ]);
    expect(createNotification).toHaveBeenCalledWith({
      registeredEvent: "PRODUCT_STATUS_CHANGE",
      callBackUri: "https://example.com/hook",
      allManagedAccounts: true,
    });
    expect(out()).toContain("Created notification subscription new");
  });

  it("creates with --target-account, building accounts/{id}", async () => {
    createNotification.mockResolvedValue({ name: "accounts/123/notificationsubscriptions/n2" });
    await run([
      "notifications",
      "create",
      "--callback-uri",
      "https://example.com/hook",
      "--target-account",
      "999",
    ]);
    expect(createNotification).toHaveBeenCalledWith({
      registeredEvent: "PRODUCT_STATUS_CHANGE",
      callBackUri: "https://example.com/hook",
      targetAccount: "accounts/999",
    });
  });

  it("rejects create without --callback-uri (exit 2)", async () => {
    await run(["notifications", "create", "--all-managed-accounts"]);
    expect(createNotification).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects a non-https callback (exit 2)", async () => {
    await run([
      "notifications",
      "create",
      "--callback-uri",
      "http://example.com/hook",
      "--all-managed-accounts",
    ]);
    expect(createNotification).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects both --all-managed-accounts and --target-account (exit 2)", async () => {
    await run([
      "notifications",
      "create",
      "--callback-uri",
      "https://example.com/hook",
      "--all-managed-accounts",
      "--target-account",
      "999",
    ]);
    expect(createNotification).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects create with neither target (exit 2)", async () => {
    await run(["notifications", "create", "--callback-uri", "https://example.com/hook"]);
    expect(createNotification).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("updates a subscription's callback", async () => {
    updateNotification.mockResolvedValue({ name: "accounts/123/notificationsubscriptions/abc" });
    await run(["notifications", "update", "abc", "--callback-uri", "https://example.com/v2"]);
    expect(updateNotification).toHaveBeenCalledWith(
      "abc",
      { callBackUri: "https://example.com/v2" },
      { updateMask: "callBackUri" },
    );
    expect(out()).toContain("Updated notification subscription abc");
  });

  it("switching the union on update clears the other side via the mask", async () => {
    updateNotification.mockResolvedValue({});
    await run(["notifications", "update", "abc", "--all-managed-accounts"]);
    expect(updateNotification).toHaveBeenCalledWith(
      "abc",
      { allManagedAccounts: true },
      { updateMask: "allManagedAccounts,targetAccount" },
    );
  });

  it("rejects an update with no fields (exit 2)", async () => {
    await run(["notifications", "update", "abc"]);
    expect(updateNotification).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("deletes a subscription and emits JSON", async () => {
    deleteNotification.mockResolvedValue(undefined);
    await run(["-j", "notifications", "delete", "accounts/123/notificationsubscriptions/abc"]);
    expect(deleteNotification).toHaveBeenCalledWith("accounts/123/notificationsubscriptions/abc");
    expect(JSON.parse(out())).toEqual({ deleted: "abc" });
  });
});
