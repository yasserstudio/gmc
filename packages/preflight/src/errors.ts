// A malformed `.gmcpreflightrc` is a configuration failure, so PreflightConfigError
// carries exit code 4 and a machine-readable code — mirroring ConfigError in
// @gmc-cli/config. Hardcoded rather than imported from @gmc-cli/core: preflight is a
// pure, leaf package and doesn't depend on core (core's ExitCode.Config is also 4).
export class PreflightConfigError extends Error {
  /** CLI exit code for configuration failures. */
  public readonly exitCode = 4;
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = "PreflightConfigError";
  }
}
