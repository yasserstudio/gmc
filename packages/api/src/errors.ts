import { apiMessageSuffix, findErrorInfo, type GoogleErrorBody } from "./google-error.js";

// Mirrors the AuthError/ConfigError contract: a CLI exit code plus a machine
// code and (optional) remediation hint. Hardcodes exitCode = 5 rather than
// importing core's ExitCode, because core depends on api, not the reverse.
export class MerchantApiError extends Error {
  /** CLI exit code for Merchant API failures. */
  public readonly exitCode = 5;
  constructor(
    message: string,
    public readonly httpStatus: number,
    /**
     * Machine-readable code (Google `reason`/`status`, or `HTTP_<n>`/`NETWORK_ERROR`).
     * Body-derived and sanitized to an enum shape, but still attacker-influenceable:
     * branch security-relevant decisions on `httpStatus`/`retryable`, not `code`.
     */
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = "MerchantApiError";
  }

  /**
   * Build a MerchantApiError from a non-OK response status and parsed body.
   * `suggestion` is intentionally left to the CLI command layer, which maps
   * reasons to user-facing remediation (the library stays presentation-free).
   */
  static fromResponse(status: number, body: GoogleErrorBody | undefined): MerchantApiError {
    const raw = findErrorInfo(body)?.reason ?? body?.error?.status;
    // Only trust an enum-shaped reason/status; otherwise fall back to the status.
    const code = raw && /^[A-Z][A-Z0-9_]*$/.test(raw) ? raw : `HTTP_${status}`;
    const retryable = status === 408 || status === 429 || status >= 500;
    const label = code.startsWith("HTTP_") ? undefined : code;
    const message = `Merchant API request failed (${status}${label ? ` ${label}` : ""})${apiMessageSuffix(body)}.`;
    return new MerchantApiError(message, status, code, retryable);
  }
}
