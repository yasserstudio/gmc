import { describe, it, expect } from "vitest";
import { MERCHANT_API_SCOPE } from "@gmc-cli/auth";
import { auditScopes } from "../src/index.js";

describe("auditScopes", () => {
  it("maps every sub-API to the unchanged content scope by default", () => {
    const report = auditScopes();
    expect(report.legacyScope).toBe(MERCHANT_API_SCOPE);
    expect(report.scopeUnchanged).toBe(true);
    expect(report.mapping.map((m) => m.subApi)).toEqual([
      "products",
      "inventories",
      "reports",
      "accounts",
      "datasources",
      "promotions",
      "notifications",
      "quota",
      "issueresolution",
      "conversions",
    ]);
    for (const m of report.mapping) expect(m.scopes).toEqual([MERCHANT_API_SCOPE]);
  });

  it("emits no checks and is ok when no identity/probe is supplied", () => {
    const report = auditScopes();
    expect(report.checks).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("records a passing credential check from identity", () => {
    const report = auditScopes({ identity: { email: "sa@x.iam", projectId: "proj" } });
    const cred = report.checks.find((c) => c.id === "credential");
    expect(cred).toMatchObject({ status: "pass" });
    expect(cred?.detail).toContain("sa@x.iam");
    expect(cred?.detail).toContain("proj");
  });

  it("warns (not fails) when the credential cannot be resolved", () => {
    const report = auditScopes({
      credentialError: { message: "no credential", suggestion: "run gmc auth login" },
    });
    expect(report.ok).toBe(true);
    const cred = report.checks.find((c) => c.id === "credential");
    expect(cred).toMatchObject({ status: "warn", suggestion: "run gmc auth login" });
  });

  it("omits the suggestion when the credential error has none", () => {
    const report = auditScopes({ credentialError: { message: "no credential" } });
    const cred = report.checks.find((c) => c.id === "credential");
    expect(cred?.suggestion).toBeUndefined();
  });

  it("surfaces the verify error in the probe-less warn detail", () => {
    const report = auditScopes({
      identity: { email: "e", projectId: null },
      verifyError: "token mint failed",
    });
    const probe = report.checks.find((c) => c.id === "merchant-api");
    expect(probe).toMatchObject({ status: "warn" });
    expect(probe?.detail).toContain("token mint failed");
  });

  it("surfaces a failing live probe and marks the report not ok", () => {
    const report = auditScopes({
      identity: { email: "e", projectId: null },
      probe: { status: "fail", message: "API not enabled", suggestion: "enable it" },
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "merchant-api")).toMatchObject({
      status: "fail",
      detail: "API not enabled",
    });
  });

  it("advises doctor when identity resolves but no probe ran", () => {
    const report = auditScopes({ identity: { email: "e", projectId: null } });
    const probe = report.checks.find((c) => c.id === "merchant-api");
    expect(probe).toMatchObject({ status: "warn" });
    expect(probe?.suggestion).toContain("gmc doctor");
  });

  it("limits the mapping to the requested sub-APIs", () => {
    const report = auditScopes({ subApis: ["products", "reports"] });
    expect(report.mapping.map((m) => m.subApi)).toEqual(["products", "reports"]);
  });
});
