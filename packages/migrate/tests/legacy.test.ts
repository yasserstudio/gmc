import { describe, it, expect } from "vitest";
import { parseMerchantInfo, MigrateError } from "../src/index.js";

describe("parseMerchantInfo", () => {
  it("extracts a numeric-string merchantId", () => {
    expect(parseMerchantInfo({ merchantId: "123456789" })).toEqual({ merchantId: "123456789" });
  });

  it("coerces a numeric merchantId to a string (Content API samples store a number)", () => {
    expect(parseMerchantInfo({ merchantId: 123456789 })).toEqual({ merchantId: "123456789" });
  });

  it("keeps accountSampleUser when present", () => {
    expect(
      parseMerchantInfo({ merchantId: "1", accountSampleUser: "sa@p.iam.gserviceaccount.com" }),
    ).toEqual({ merchantId: "1", accountSampleUser: "sa@p.iam.gserviceaccount.com" });
  });

  it.each([
    ["a non-object", "not an object"],
    ["an array", []],
    ["null", null],
  ])("throws MIGRATE_LEGACY_INVALID for %s", (_label, value) => {
    expect(() => parseMerchantInfo(value)).toThrow(MigrateError);
    try {
      parseMerchantInfo(value);
    } catch (err) {
      expect((err as MigrateError).code).toBe("MIGRATE_LEGACY_INVALID");
      expect((err as MigrateError).exitCode).toBe(2);
    }
  });

  it.each([
    ["a missing merchantId", {}],
    ["a non-numeric merchantId", { merchantId: "abc" }],
    ["an empty merchantId", { merchantId: "" }],
    ["an out-of-safe-range numeric merchantId", { merchantId: 123456789012345678901234567890 }],
  ])("throws MIGRATE_LEGACY_NO_MERCHANT_ID for %s", (_label, value) => {
    expect(() => parseMerchantInfo(value)).toThrow(MigrateError);
    try {
      parseMerchantInfo(value);
    } catch (err) {
      expect((err as MigrateError).code).toBe("MIGRATE_LEGACY_NO_MERCHANT_ID");
    }
  });
});
