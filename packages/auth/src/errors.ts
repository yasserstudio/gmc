/** Coerce an unknown error to a bounded, log-safe message string. */
export function safeErrorMessage(err: unknown, max = 150): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > max ? raw.slice(0, max) + "..." : raw;
}

export class AuthError extends Error {
  /** CLI exit code for auth failures. */
  public readonly exitCode = 3;
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        suggestion: this.suggestion,
      },
    };
  }
}
