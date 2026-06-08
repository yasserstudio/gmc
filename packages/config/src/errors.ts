// Config errors carry a CLI exit code (4) and a machine-readable code, mirroring
// the AuthError contract in @gmc-cli/auth. Hardcoded rather than imported from
// @gmc-cli/core because core depends on config, not the other way around.
export class ConfigError extends Error {
  /** CLI exit code for configuration failures. */
  public readonly exitCode = 4;
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}
