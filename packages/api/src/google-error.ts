// Shared parsing of the Google API error body, used by both the doctor probe
// and the Merchant API client so the two interpret error payloads identically.

export interface GoogleErrorDetail {
  "@type"?: string;
  reason?: string;
  domain?: string;
  metadata?: Record<string, string>;
}

export interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: GoogleErrorDetail[];
  };
}

/**
 * Find the ErrorInfo detail (it carries `reason` + `metadata`), preferring an
 * explicit `@type` match and falling back to any detail with a `reason` so a
 * payload-shape change doesn't blank the diagnosis.
 */
export function findErrorInfo(body: GoogleErrorBody | undefined): GoogleErrorDetail | undefined {
  const details = body?.error?.details;
  return (
    details?.find((d) => d["@type"]?.includes("ErrorInfo") && d.reason) ??
    details?.find((d) => d.reason)
  );
}

/** Bounded ": <api message>" suffix so a hostile/huge message can't flood output. */
export function apiMessageSuffix(body: GoogleErrorBody | undefined): string {
  const message = body?.error?.message;
  if (!message) return "";
  return `: ${message.length > 200 ? message.slice(0, 200) + "…" : message}`;
}
