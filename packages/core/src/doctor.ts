// `gmc doctor` orchestration: resolve a credential, mint a token, then probe the
// Merchant API and interpret the result. Each step becomes a check so the tool
// reports a full diagnosis rather than bailing on the first failure — and so it
// catches the silent GCP-registration / API-not-enabled trap.

import { resolveAuth, AuthError, type AuthClient } from "@gmc-cli/auth";
import { probeMerchantApi } from "@gmc-cli/api";

export type CheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  suggestion?: string;
}

export interface DoctorIdentity {
  email: string | null;
  projectId: string | null;
}

export interface DoctorReport {
  /** True when no check failed (warnings are allowed). */
  ok: boolean;
  /** Process exit code: 0 = ok, 3 = auth failure, 1 = other problem found. */
  exitCode: number;
  profile: string;
  accountId: string | null;
  identity: DoctorIdentity;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  /** Config/credential directory (token cache + stored OAuth login). */
  configDir: string;
  /** Resolved profile name. */
  profile: string;
  /** Resolved Merchant Center account id, if any. */
  accountId?: string;
  /** Merchant API base URL override (for testing). */
  baseUrl?: string;
}

function failFromError(id: string, title: string, err: unknown): DoctorCheck {
  if (err instanceof AuthError) {
    return {
      id,
      title,
      status: "fail",
      detail: err.message,
      ...(err.suggestion ? { suggestion: err.suggestion } : {}),
    };
  }
  return { id, title, status: "fail", detail: err instanceof Error ? err.message : String(err) };
}

// `failureExit` carries the exit code of a structured failure (e.g. AuthError → 3)
// so the CLI can branch on the failure class; other failures default to 1.
function report(
  options: DoctorOptions,
  identity: DoctorIdentity,
  checks: DoctorCheck[],
  failureExit?: number,
): DoctorReport {
  const ok = !checks.some((c) => c.status === "fail");
  return {
    ok,
    exitCode: ok ? 0 : (failureExit ?? 1),
    profile: options.profile,
    accountId: options.accountId ?? null,
    identity,
    checks,
  };
}

/**
 * Run the doctor diagnosis. Always resolves (network/auth failures become
 * `fail` checks); never throws on a diagnosable problem.
 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const identity: DoctorIdentity = { email: null, projectId: null };

  // 1. Resolve a credential (offline).
  let client: AuthClient;
  try {
    client = await resolveAuth({ cachePath: options.configDir, profile: options.profile });
    identity.email = client.getClientEmail();
    identity.projectId = client.getProjectId() ?? null;
    checks.push({
      id: "credentials",
      title: "Credentials resolved",
      status: "pass",
      detail: `Authenticated as ${identity.email}${identity.projectId ? ` (project ${identity.projectId})` : ""}.`,
    });
  } catch (err) {
    checks.push(failFromError("credentials", "Credentials resolved", err));
    return report(options, identity, checks, err instanceof AuthError ? err.exitCode : undefined);
  }

  // 2. Mint an access token (network).
  let token: string;
  try {
    token = await client.getAccessToken();
    checks.push({
      id: "token",
      title: "Access token acquired",
      status: "pass",
      detail: "The credential minted a valid access token.",
    });
  } catch (err) {
    checks.push(failFromError("token", "Access token acquired", err));
    return report(options, identity, checks, err instanceof AuthError ? err.exitCode : undefined);
  }

  // 3. Account configured (informational — the probe still works without one).
  if (!options.accountId) {
    checks.push({
      id: "account",
      title: "Account configured",
      status: "warn",
      detail: "No Merchant Center account id is configured; probing accounts.list.",
      suggestion: "Set one with --account <id>, GMC_ACCOUNT_ID, or a profile in your config.",
    });
  }

  // 4. Probe the Merchant API (network) — catches the silent registration trap.
  const probe = await probeMerchantApi(token, {
    ...(options.accountId ? { accountId: options.accountId } : {}),
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(identity.projectId ? { projectId: identity.projectId } : {}),
  });
  checks.push({
    id: "merchant-api",
    title: "Merchant API access",
    status: probe.status,
    detail: probe.message,
    ...(probe.suggestion ? { suggestion: probe.suggestion } : {}),
  });

  return report(options, identity, checks);
}
