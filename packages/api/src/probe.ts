// A minimal, dependency-free Merchant API probe used by `gmc doctor`. It hits
// the Accounts sub-API with a bearer token and interprets the response — the
// status-code interpretation (especially the SERVICE_DISABLED "API not enabled"
// trap and the empty-result "not linked" trap) is the diagnostic value, not the
// body schema. Shares Google-error parsing with the typed client (Phase 2).

import { apiMessageSuffix, findErrorInfo, type GoogleErrorBody } from "./google-error.js";

const DEFAULT_BASE_URL = "https://merchantapi.googleapis.com";
const ACTIVATION_FALLBACK =
  "https://console.cloud.google.com/apis/library/merchantapi.googleapis.com";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface ProbeOptions {
  /** Merchant Center account id; when set, probes accounts.get instead of accounts.list. */
  accountId?: string;
  /** Base URL override (defaults to the Merchant API endpoint). */
  baseUrl?: string;
  /** GCP project id, used to enrich the "API not enabled" message when known. */
  projectId?: string;
  /** Injectable fetch for testing; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

export interface ProbeResult {
  status: "pass" | "warn" | "fail";
  /** HTTP status code, when a response was received. */
  httpStatus?: number;
  /** Google error reason (e.g. SERVICE_DISABLED), when present. */
  reason?: string;
  message: string;
  suggestion?: string;
  /** Accounts returned by accounts.list, when applicable. */
  accountCount?: number;
}

type ProbeBody = GoogleErrorBody & { accounts?: unknown[] };

/**
 * Probe the Merchant API with an access token and classify the result into a
 * pass / warn / fail diagnosis with actionable remediation.
 */
export async function probeMerchantApi(
  accessToken: string,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  const path = options.accountId
    ? `/accounts/v1beta/accounts/${encodeURIComponent(options.accountId)}`
    : "/accounts/v1beta/accounts";
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  let res: Response;
  try {
    res = await doFetch(`${base}${path}`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      status: "fail",
      message: `Could not reach the Merchant API (request ${timedOut ? "timed out" : "failed"}).`,
      suggestion: "Check your network and that merchantapi.googleapis.com is reachable.",
    };
  }

  const body = (await res.json().catch(() => undefined)) as ProbeBody | undefined;

  if (res.ok) {
    const accounts = body?.accounts;
    const accountCount = Array.isArray(accounts) ? accounts.length : undefined;
    if (accountCount === 0) {
      // Authenticated but zero accessible accounts: the credential can't operate.
      // This is the silent linking trap, so it fails rather than warns.
      return {
        status: "fail",
        httpStatus: res.status,
        accountCount,
        message: "Authenticated, but no Merchant Center accounts are accessible.",
        suggestion:
          "Link this credential under Merchant Center → Settings → Account access / API clients, or register the Cloud project as an API client.",
      };
    }
    return {
      status: "pass",
      httpStatus: res.status,
      ...(accountCount !== undefined ? { accountCount } : {}),
      message:
        accountCount !== undefined
          ? `Merchant API reachable — ${accountCount} account(s) accessible.`
          : `Merchant API reachable${options.accountId ? ` — account ${options.accountId} accessible.` : "."}`,
    };
  }

  const detail = findErrorInfo(body);
  const reason = detail?.reason;
  const failResult = (message: string, suggestion: string): ProbeResult => ({
    status: "fail",
    httpStatus: res.status,
    ...(reason ? { reason } : {}),
    message,
    suggestion,
  });

  if (res.status === 401) {
    return failResult(
      "The Merchant API rejected the access token (401 Unauthorized).",
      "Re-authenticate (`gmc auth login`, or refresh your service-account key) and try again.",
    );
  }

  if (res.status === 403 && reason === "SERVICE_DISABLED") {
    const project = detail?.metadata?.["consumer"]?.replace(/^projects\//, "") ?? options.projectId;
    const rawUrl = detail?.metadata?.["activationUrl"];
    // Only trust an https activation URL from the response; else use the constant.
    const activationUrl = rawUrl?.startsWith("https://") ? rawUrl : ACTIVATION_FALLBACK;
    return failResult(
      `The Merchant API is not enabled on your Google Cloud project${project ? ` (${project})` : ""}.`,
      `Enable it, then wait a minute and retry: ${activationUrl}`,
    );
  }

  if (res.status === 403) {
    return failResult(
      "Permission denied by the Merchant API (403).",
      "The credential isn't authorized for this Merchant Center account, or the Cloud project isn't registered as an API client. Add the principal under Merchant Center → Settings → Account access / Developers.",
    );
  }

  if (res.status === 404 && options.accountId) {
    return failResult(
      `Merchant Center account ${options.accountId} was not found or is not accessible (404).`,
      "Check the account id and that your credential has access to it.",
    );
  }

  if (res.status === 429) {
    return failResult(
      "Rate-limited by the Merchant API (429).",
      "Back off and retry; check your Merchant API quota in the Cloud console.",
    );
  }

  if (res.status === 400) {
    return failResult(
      `The Merchant API rejected the request (400)${apiMessageSuffix(body)}.`,
      "Check the account id (numeric) and the request parameters.",
    );
  }

  if (res.status >= 500) {
    return failResult(
      `The Merchant API is unavailable (${res.status}).`,
      "This is usually transient — retry shortly, or check the Merchant API status.",
    );
  }

  return failResult(
    `Unexpected Merchant API response (${res.status})${apiMessageSuffix(body)}.`,
    "Re-run with --json for the full diagnosis, or check the Merchant API status.",
  );
}
