// A bad migration input — an unrecognized legacy config or a missing/invalid
// merchantId passed via `--from` — is the user pointing the command at the wrong
// file, i.e. invalid *usage* (exit 2), not a malformed gmc config (which is exit 4,
// as PreflightConfigError uses). MigrateError carries the code inline so it
// satisfies core's StructuredError contract and the CLI's reportError maps it,
// without this leaf package depending on @gmc-cli/core (ExitCode.Usage is also 2).
export class MigrateError extends Error {
  /** CLI exit code for invalid migration input (ExitCode.Usage). */
  public readonly exitCode = 2;
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = "MigrateError";
  }
}
