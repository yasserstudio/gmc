// @gmc-cli/core — command orchestration and shared context.
// Phase 0 scaffold. Phase 1 adds the doctor check; Phase 4 the preflight scanner.

/** Shared execution context threaded through commands. */
export interface CommandContext {
  /** Emit machine-readable JSON instead of human output. */
  json: boolean;
  /** Selected auth/account profile, if any. */
  profile?: string;
}

/** Build a {@link CommandContext} from parsed global options. */
export function createContext(options: { json?: boolean; profile?: string } = {}): CommandContext {
  return {
    json: options.json ?? false,
    profile: options.profile,
  };
}
