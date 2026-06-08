import { describe, it, expect } from "vitest";
import { ExitCode } from "@gmc-cli/core";
import { ConfigError, DEFAULT_PROFILE as CONFIG_DEFAULT_PROFILE } from "@gmc-cli/config";
import { AuthError, DEFAULT_PROFILE as AUTH_DEFAULT_PROFILE } from "@gmc-cli/auth";
import { MerchantApiError } from "@gmc-cli/api";

// Cross-package invariants. Each error hardcodes its exit code (it cannot import
// core's ExitCode without a dependency cycle), and the two DEFAULT_PROFILE
// constants are declared independently — pin them so they cannot silently drift.
describe("cross-package contracts", () => {
  it("ConfigError.exitCode matches ExitCode.Config", () => {
    expect(new ConfigError("x", "CODE").exitCode).toBe(ExitCode.Config);
  });

  it("AuthError.exitCode matches ExitCode.Auth", () => {
    expect(new AuthError("x", "CODE").exitCode).toBe(ExitCode.Auth);
  });

  it("MerchantApiError.exitCode matches ExitCode.Api", () => {
    expect(new MerchantApiError("x", 500, "CODE", true).exitCode).toBe(ExitCode.Api);
  });

  it("auth and config agree on the default profile name", () => {
    expect(AUTH_DEFAULT_PROFILE).toBe(CONFIG_DEFAULT_PROFILE);
  });
});
