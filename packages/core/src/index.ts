// @gmc-cli/core — command orchestration, shared context, and CLI output/exit
// conventions. Phase 1 adds exit codes, the structured-error contract, the
// JSON/error output helpers every command shares, and the doctor diagnosis.
// Phase 4 adds the preflight scanner.

export { runDoctor } from "./doctor.js";
export type {
  DoctorOptions,
  DoctorReport,
  DoctorCheck,
  DoctorIdentity,
  CheckStatus,
} from "./doctor.js";

export { createMerchantClient } from "./client.js";
export type { CreateMerchantClientOptions } from "./client.js";

/**
 * Canonical process exit codes. Commands set `process.exitCode` to one of these
 * so CI can branch on the failure class.
 */
export const ExitCode = {
  /** Command succeeded. */
  Success: 0,
  /** Generic, unclassified failure. */
  Error: 1,
  /** Invalid CLI usage (unknown command/flag, bad arguments). */
  Usage: 2,
  /** Authentication failure (see @gmc-cli/auth AuthError). */
  Auth: 3,
  /** Configuration failure (see @gmc-cli/config ConfigError). */
  Config: 4,
  /** Merchant API failure (see @gmc-cli/api MerchantApiError). */
  Api: 5,
  /** Preflight found gating violations (see @gmc-cli/preflight). */
  Preflight: 6,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** Shared execution context threaded through commands. */
export interface CommandContext {
  /** Emit machine-readable JSON instead of human output. */
  json: boolean;
  /** Whether colored output is allowed (false under --no-color). */
  color: boolean;
  /** Resolved auth/account profile name — always set ("default" if unspecified). */
  profile: string;
  /** Resolved Merchant Center account id, if any. */
  accountId?: string;
}

/** Build a {@link CommandContext} from resolved global options. */
export function createContext(
  options: { json?: boolean; color?: boolean; profile?: string; accountId?: string } = {},
): CommandContext {
  const ctx: CommandContext = {
    json: options.json ?? false,
    color: options.color ?? true,
    profile: options.profile ?? "default",
  };
  if (options.accountId !== undefined) ctx.accountId = options.accountId;
  return ctx;
}

/**
 * The contract every domain error implements: a CLI exit code plus an optional
 * machine code and remediation hint. AuthError (@gmc-cli/auth) and ConfigError
 * (@gmc-cli/config) both satisfy it without importing core.
 */
export interface StructuredError {
  message: string;
  exitCode: number;
  code?: string;
  suggestion?: string;
}

/** Type guard for an error that carries a numeric `exitCode`. */
export function isStructuredError(err: unknown): err is StructuredError {
  return err instanceof Error && typeof (err as { exitCode?: unknown }).exitCode === "number";
}

/**
 * Invalid CLI usage (a missing or malformed argument). A real error class — like
 * AuthError/ConfigError/MerchantApiError — so reportError maps it to
 * {@link ExitCode.Usage} with a remediation hint, and tests can assert on it.
 */
export class UsageError extends Error implements StructuredError {
  readonly exitCode = ExitCode.Usage;
  readonly code = "USAGE";
  constructor(
    message: string,
    readonly suggestion: string,
  ) {
    super(message);
    this.name = "UsageError";
  }
}

/** Write one line of JSON to stdout. */
export function emitJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

/**
 * Report an error consistently and set `process.exitCode`. In JSON mode a
 * `{ ok: false, error }` envelope goes to stdout (single parseable stream); in
 * human mode the message — and any suggestion — go to stderr. `extra` fields are
 * merged into the JSON envelope alongside `ok`/`error` (e.g. partial progress a CI
 * consumer needs) — they can't override `ok`/`error`, don't affect human output, and
 * must never carry secrets.
 */
export function reportError(
  err: unknown,
  ctx: { json: boolean },
  humanPrefix = "gmc",
  extra?: Record<string, unknown>,
): void {
  if (isStructuredError(err)) {
    if (ctx.json) {
      // `extra` is spread first so it can never clobber the `ok`/`error` envelope keys.
      emitJson({
        ...extra,
        ok: false,
        error: { code: err.code, message: err.message, suggestion: err.suggestion },
      });
    } else {
      process.stderr.write(`${err.message}\n`);
      if (err.suggestion) process.stderr.write(`\n${err.suggestion}\n`);
    }
    process.exitCode = err.exitCode;
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  if (ctx.json) {
    emitJson({ ...extra, ok: false, error: { message } });
  } else {
    process.stderr.write(`${humanPrefix}: ${message}\n`);
  }
  process.exitCode = ExitCode.Error;
}
