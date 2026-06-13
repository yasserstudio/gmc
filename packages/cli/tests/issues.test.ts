import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { resolveAuth, renderAccountIssues, renderProductIssues } = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  renderAccountIssues: vi.fn(),
  renderProductIssues: vi.fn(),
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
    IssuesService: class {
      renderAccountIssues = renderAccountIssues;
      renderProductIssues = renderProductIssues;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc issues", () => {
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-issues-noconfig");
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

  it("renders account issues with severity tag, impact, and breakdown", async () => {
    renderAccountIssues.mockResolvedValue([
      {
        title: "Misrepresentation",
        impact: {
          severity: "ERROR",
          message: "Account suspended for policy violation.",
          breakdowns: [
            { regions: [{ code: "US", name: "United States" }], details: ["Shopping ads"] },
          ],
        },
        prerenderedContent: "<p>details</p>",
      },
    ]);
    await run(["issues", "account"]);
    expect(out()).toContain("1 issue(s)");
    expect(out()).toContain("[ERROR] Misrepresentation");
    expect(out()).toContain("Account suspended");
    expect(out()).toContain("United States — Shopping ads");
    expect(out()).toContain("prerenderedContent");
  });

  it("passes --language and --time-zone through to the render call", async () => {
    renderAccountIssues.mockResolvedValue([]);
    await run(["issues", "account", "--language", "en-GB", "--time-zone", "Europe/London"]);
    expect(renderAccountIssues).toHaveBeenCalledWith({
      languageCode: "en-GB",
      timeZone: "Europe/London",
    });
  });

  it("emits JSON under an { issues } envelope", async () => {
    renderAccountIssues.mockResolvedValue([{ title: "Misrepresentation" }]);
    await run(["-j", "issues", "account"]);
    expect(JSON.parse(out())).toEqual({ issues: [{ title: "Misrepresentation" }] });
  });

  it("renders product issues for the given product id", async () => {
    renderProductIssues.mockResolvedValue([{ title: "Image too small" }]);
    await run(["issues", "product", "online~en~US~sku1"]);
    expect(renderProductIssues).toHaveBeenCalledWith("online~en~US~sku1", {
      languageCode: undefined,
      timeZone: undefined,
    });
    expect(out()).toContain("[ISSUE] Image too small");
  });

  it("tags SEVERITY_UNSPECIFIED issues as [ISSUE]", async () => {
    renderAccountIssues.mockResolvedValue([
      { title: "Pending review", impact: { severity: "SEVERITY_UNSPECIFIED" } },
    ]);
    await run(["issues", "account"]);
    expect(out()).toContain("[ISSUE] Pending review");
  });

  it("falls back to the region code when a region has no name", async () => {
    renderAccountIssues.mockResolvedValue([
      {
        title: "Shipping",
        impact: { breakdowns: [{ regions: [{ code: "US" }], details: ["Free listings"] }] },
      },
    ]);
    await run(["issues", "account"]);
    expect(out()).toContain("US — Free listings");
  });

  it("reports an empty account-issue list", async () => {
    renderAccountIssues.mockResolvedValue([]);
    await run(["issues", "account"]);
    expect(out()).toContain("No account issues");
  });

  it("reports no issues for a product", async () => {
    renderProductIssues.mockResolvedValue([]);
    await run(["issues", "product", "online~en~US~sku1"]);
    expect(out()).toContain("No issues for this product");
  });
});
