import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

const listProducts = vi.fn();

vi.mock("@gmc-cli/auth", () => ({
  resolveAuth: vi.fn(async () => ({
    getAccessToken: async () => "tok",
    getClientEmail: () => "e",
    getProjectId: () => undefined,
  })),
}));

vi.mock("@gmc-cli/api", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/api")>();
  return {
    ...actual,
    MerchantClient: class {
      constructor(_options: unknown) {}
    },
    ProductsService: class {
      listProducts = listProducts;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

// A fully-compliant product: zero findings (no errors, no warnings) across the rule set.
const GOOD = JSON.stringify({
  offerId: "SKU1",
  channel: "ONLINE",
  contentLanguage: "en",
  feedLabel: "US",
  attributes: {
    title: "Trail Runner",
    description: "A lightweight trail running shoe.",
    link: "https://example.com/trail-runner",
    imageLink: "https://example.com/trail-runner.jpg",
    availability: "in_stock",
    condition: "new",
    brand: "Acme",
    price: { amountMicros: "49990000", currencyCode: "USD" },
  },
});
// Identical to GOOD but missing only the title — isolates required.title for the
// rule + config tests (so turning required.title off leaves a clean product).
const MISSING_TITLE = JSON.stringify({
  offerId: "SKU2",
  channel: "ONLINE",
  contentLanguage: "en",
  feedLabel: "US",
  attributes: {
    description: "A lightweight trail running shoe.",
    link: "https://example.com/trail-runner",
    imageLink: "https://example.com/trail-runner.jpg",
    availability: "in_stock",
    condition: "new",
    brand: "Acme",
    price: { amountMicros: "1000", currencyCode: "USD" },
  },
});

describe("gmc preflight", () => {
  let writes: string[];
  let errs: string[];
  let savedEnv: Record<string, string | undefined>;
  let dir: string;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-preflight-test-no-config");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-preflight-"));
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
  });

  const out = () => writes.join("");

  it("passes a clean directory (exit 0)", async () => {
    writeFileSync(join(dir, "good.json"), GOOD);
    await run(["preflight", "--dir", dir]);
    expect(out()).toContain("No issues found");
    expect(process.exitCode).toBe(0);
  });

  it("flags a non-compliant product and exits 6", async () => {
    writeFileSync(join(dir, "good.json"), GOOD);
    writeFileSync(join(dir, "bad.json"), MISSING_TITLE);
    await run(["preflight", "--dir", dir]);
    expect(out()).toContain("Missing title");
    expect(out()).toContain("ONLINE~en~US~SKU2");
    expect(process.exitCode).toBe(6);
  });

  it("folds an unparseable file in as an error finding (exit 6)", async () => {
    writeFileSync(join(dir, "good.json"), GOOD);
    writeFileSync(join(dir, "broken.json"), "not json {");
    await run(["preflight", "--dir", dir]);
    expect(out()).toContain("Could not parse broken.json");
    expect(process.exitCode).toBe(6);
  });

  it("emits a JSON report with --json", async () => {
    writeFileSync(join(dir, "bad.json"), MISSING_TITLE);
    await run(["--json", "preflight", "--dir", dir]);
    const report = JSON.parse(out());
    expect(report).toMatchObject({ ok: false, exitCode: 6, scanned: 1, strict: false });
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
    expect(report.findings.map((f: { ruleId: string }) => f.ruleId)).toContain("required.title");
  });

  it("scans a single file with --file", async () => {
    const file = join(dir, "one.json");
    writeFileSync(file, MISSING_TITLE);
    await run(["preflight", "--file", file]);
    expect(out()).toContain("Missing title");
    expect(process.exitCode).toBe(6);
  });

  it("scans the live catalog with --remote", async () => {
    listProducts.mockResolvedValue([
      {
        name: "accounts/123/products/online~en~US~SKU9",
        offerId: "SKU9",
        channel: "ONLINE",
        contentLanguage: "en",
        feedLabel: "US",
        attributes: { price: { amountMicros: "1000", currencyCode: "USD" } }, // no title
      },
    ]);
    await run(["preflight", "--remote"]);
    expect(listProducts).toHaveBeenCalled();
    expect(out()).toContain("scanned 1 product");
    expect(out()).toContain("Missing title");
    expect(process.exitCode).toBe(6);
  });

  it("applies a discovered .gmcpreflightrc (rule off + ignore)", async () => {
    writeFileSync(join(dir, "bad.json"), MISSING_TITLE);
    writeFileSync(
      join(dir, ".gmcpreflightrc"),
      JSON.stringify({ rules: { "required.title": "off" } }),
    );
    await run(["preflight", "--dir", dir]);
    expect(out()).toContain("No issues found");
    expect(process.exitCode).toBe(0);
  });

  it("--strict turns a configured warning into a failure", async () => {
    writeFileSync(join(dir, "bad.json"), MISSING_TITLE);
    writeFileSync(
      join(dir, ".gmcpreflightrc"),
      JSON.stringify({ rules: { "required.title": "warning" } }),
    );
    await run(["preflight", "--dir", dir]);
    expect(process.exitCode).toBe(0); // warning alone doesn't gate
    process.exitCode = 0;
    writes.length = 0;
    await run(["preflight", "--dir", dir, "--strict"]);
    expect(process.exitCode).toBe(6);
  });

  it("rejects an unknown --rule (usage error, exit 2)", async () => {
    writeFileSync(join(dir, "good.json"), GOOD);
    await run(["preflight", "--dir", dir, "--rule", "nope.rule"]);
    expect(errs.join("")).toContain('Unknown rule "nope.rule"');
    expect(process.exitCode).toBe(2);
  });

  it("reports a malformed .gmcpreflightrc as a config error (exit 4)", async () => {
    writeFileSync(join(dir, "good.json"), GOOD);
    writeFileSync(join(dir, ".gmcpreflightrc"), '{"strict":"yes"}');
    await run(["preflight", "--dir", dir]);
    expect(errs.join("")).toContain("strict");
    expect(process.exitCode).toBe(4);
  });

  it("errors clearly on an unreadable directory (usage error, exit 2)", async () => {
    await run(["preflight", "--dir", join(dir, "does-not-exist")]);
    expect(errs.join("")).toContain("Could not read feed directory");
    expect(process.exitCode).toBe(2);
  });
});
