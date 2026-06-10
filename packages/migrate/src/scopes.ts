// The scope/auth half of `gmc migrate scopes`. Pure: it maps the legacy Content
// API scope to the Merchant API per-sub-API model and folds in identity/probe
// results the CLI gathered, producing a diagnosis. The network (token mint +
// probe) and credential resolution happen in the CLI; this engine only interprets.

import { MERCHANT_API_SCOPE, SUB_APIS, scopesFor, type SubApi } from "@gmc-cli/auth";
import type { CheckStatus, MigrationCheck, ScopeAuditReport, SubApiScopeMapping } from "./types.js";

/** What the CLI feeds the audit after its (best-effort) credential + probe work. */
export interface ScopeAuditInput {
  /** Resolved credential identity, when the credential resolved offline. */
  identity?: { email: string | null; projectId: string | null };
  /** Live Merchant API probe, when a token was minted and the probe ran. */
  probe?: { status: CheckStatus; message: string; suggestion?: string };
  /** Why the credential couldn't be resolved (auth not set up for this profile yet). */
  credentialError?: { message: string; suggestion?: string };
  /** Why the live probe didn't run (token mint or network failure), if it threw. */
  verifyError?: string;
  /** Sub-APIs to show in the mapping (defaults to all). */
  subApis?: readonly SubApi[];
}

/**
 * Diagnose Content API → Merchant API auth readiness. Always returns a report
 * (never throws): the scope mapping is computed offline, and missing
 * identity/probe inputs degrade to `warn` checks rather than failures, because
 * users run this mid-migration before auth is fully wired up.
 */
export function auditScopes(input: ScopeAuditInput = {}): ScopeAuditReport {
  const subApis = input.subApis ?? SUB_APIS;
  const mapping: SubApiScopeMapping[] = subApis.map((subApi) => ({
    subApi,
    scopes: scopesFor(subApi),
  }));
  // True until Google ships granular scopes (then scopes.ts changes and this flips).
  const scopeUnchanged = mapping.every(
    (m) => m.scopes.length === 1 && m.scopes[0] === MERCHANT_API_SCOPE,
  );

  const checks: MigrationCheck[] = [];

  // 1. Credential resolved (offline).
  if (input.identity) {
    const project = input.identity.projectId ? ` (project ${input.identity.projectId})` : "";
    checks.push({
      id: "credential",
      title: "Credential resolved",
      status: "pass",
      detail: input.identity.email
        ? `Authenticated as ${input.identity.email}${project}.`
        : `Credential resolved${project}.`,
    });
  } else if (input.credentialError) {
    checks.push({
      id: "credential",
      title: "Credential resolved",
      status: "warn",
      detail: input.credentialError.message,
      ...(input.credentialError.suggestion ? { suggestion: input.credentialError.suggestion } : {}),
    });
  }

  // 2. Live Merchant API access — the *actual* migration blocker (GCP project
  //    registration + Merchant API enablement), not the scope string.
  if (input.probe) {
    checks.push({
      id: "merchant-api",
      title: "Merchant API access",
      status: input.probe.status,
      detail: input.probe.message,
      ...(input.probe.suggestion ? { suggestion: input.probe.suggestion } : {}),
    });
  } else if (input.identity) {
    // Credential resolved but the probe didn't run (token mint or network failed).
    // Surface the cause rather than swallowing it, so a broken token doesn't read
    // as a benign "couldn't check".
    checks.push({
      id: "merchant-api",
      title: "Merchant API access",
      status: "warn",
      detail: input.verifyError
        ? `Could not verify live Merchant API access: ${input.verifyError}`
        : "Could not verify live Merchant API access.",
      suggestion: "Run `gmc doctor` to diagnose API enablement and project registration.",
    });
  }

  const ok = !checks.some((c) => c.status === "fail");
  return { legacyScope: MERCHANT_API_SCOPE, scopeUnchanged, mapping, checks, ok };
}
