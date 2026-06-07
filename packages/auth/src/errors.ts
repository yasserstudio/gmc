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
