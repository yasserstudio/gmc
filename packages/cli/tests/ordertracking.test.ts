import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

const { resolveAuth, createOrderTrackingSignal } = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  createOrderTrackingSignal: vi.fn(),
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
    OrderTrackingService: class {
      createOrderTrackingSignal = createOrderTrackingSignal;
    },
  };
});

import { createProgram } from "../src/program.js";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

// The minimal valid signal body used across the write tests.
const VALID = {
  orderId: "order-abc",
  shippingInfo: [{ shipmentId: "s1", shippingStatus: "SHIPPED" }],
  lineItems: [{ lineItemId: "li-1", productId: "online:en:US:sku1", quantity: "2" }],
};

describe("gmc ordertracking", () => {
  let writes: string[];
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
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-ordertracking-noconfig");
    process.env["GMC_ACCOUNT_ID"] = "123";
    dir = mkdtempSync(join(tmpdir(), "gmc-ordertracking-"));
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
    rmSync(dir, { recursive: true, force: true });
    for (const key of ENV) {
      const v = savedEnv[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  const out = (): string => writes.join("");

  const writeSignal = (body: unknown): string => {
    const file = join(dir, "signal.json");
    writeFileSync(file, JSON.stringify(body));
    return file;
  };

  it("creates a signal from --file and prints its id + summary", async () => {
    createOrderTrackingSignal.mockResolvedValue({
      orderTrackingSignalId: "999",
      orderId: "order-abc",
      shippingInfo: [{ shipmentId: "s1" }],
      lineItems: [{ lineItemId: "li-1" }],
    });
    await run(["ordertracking", "create", "--file", writeSignal(VALID)]);
    expect(createOrderTrackingSignal).toHaveBeenCalledWith(VALID);
    expect(out()).toContain("Created order tracking signal 999");
    expect(out()).toContain("1 shipment(s) · 1 line item(s)");
  });

  it("strips the output-only orderTrackingSignalId from the file body", async () => {
    createOrderTrackingSignal.mockResolvedValue({ orderTrackingSignalId: "1" });
    const file = writeSignal({ ...VALID, orderTrackingSignalId: "should-be-stripped" });
    await run(["ordertracking", "create", "--file", file]);
    expect(createOrderTrackingSignal).toHaveBeenCalledWith(VALID);
  });

  it("applies --merchant-id over the body", async () => {
    createOrderTrackingSignal.mockResolvedValue({ orderTrackingSignalId: "1" });
    await run(["ordertracking", "create", "--file", writeSignal(VALID), "--merchant-id", "555"]);
    expect(createOrderTrackingSignal).toHaveBeenCalledWith({ ...VALID, merchantId: "555" });
  });

  it("emits the full signal as JSON with -j", async () => {
    const created = { orderTrackingSignalId: "999", orderId: "order-abc" };
    createOrderTrackingSignal.mockResolvedValue(created);
    await run(["-j", "ordertracking", "create", "--file", writeSignal(VALID)]);
    expect(JSON.parse(out())).toEqual(created);
  });

  it("rejects a signal missing required fields (exit 2)", async () => {
    await run(["ordertracking", "create", "--file", writeSignal({ orderId: "order-abc" })]);
    expect(createOrderTrackingSignal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects an empty shippingInfo array (exit 2)", async () => {
    const file = writeSignal({ ...VALID, shippingInfo: [] });
    await run(["ordertracking", "create", "--file", file]);
    expect(createOrderTrackingSignal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects an empty lineItems array (exit 2)", async () => {
    const file = writeSignal({ ...VALID, lineItems: [] });
    await run(["ordertracking", "create", "--file", file]);
    expect(createOrderTrackingSignal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects a non-array shippingInfo — an object is not a valid array (exit 2)", async () => {
    const file = writeSignal({ ...VALID, shippingInfo: { shipmentId: "s1" } });
    await run(["ordertracking", "create", "--file", file]);
    expect(createOrderTrackingSignal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("rejects a blank/whitespace orderId (exit 2)", async () => {
    const file = writeSignal({ ...VALID, orderId: "   " });
    await run(["ordertracking", "create", "--file", file]);
    expect(createOrderTrackingSignal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });
});
