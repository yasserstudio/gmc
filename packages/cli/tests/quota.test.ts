import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { resolveAuth, listQuotas } = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  listQuotas: vi.fn(),
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
    QuotaService: class {
      listQuotas = listQuotas;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc quota", () => {
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-quota-noconfig");
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

  it("lists quota groups with usage/limit and minute limit", async () => {
    listQuotas.mockResolvedValue([
      {
        name: "accounts/123/quotas/products",
        quotaUsage: "12",
        quotaLimit: "1000000",
        quotaMinuteLimit: "1000",
      },
    ]);
    await run(["quota", "list"]);
    expect(out()).toContain("1 quota group(s)");
    expect(out()).toContain("products");
    expect(out()).toContain("12/1000000 daily");
    expect(out()).toContain("1000/min");
  });

  it("emits JSON under a { quotas } envelope", async () => {
    listQuotas.mockResolvedValue([{ name: "accounts/123/quotas/products", quotaUsage: "12" }]);
    await run(["-j", "quota", "list"]);
    expect(JSON.parse(out())).toEqual({
      quotas: [{ name: "accounts/123/quotas/products", quotaUsage: "12" }],
    });
  });

  it("reports an empty list", async () => {
    listQuotas.mockResolvedValue([]);
    await run(["quota", "list"]);
    expect(out()).toContain("No quota groups");
  });
});
