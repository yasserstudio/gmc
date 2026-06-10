// Compute what migrating a merchant id into a gmc profile would change, without
// touching disk. The CLI reads the existing config, calls this to get a plan it
// can show (dry-run) or apply (`--write` via @gmc-cli/config upsertProfile), and
// renders the result. Pure: no filesystem, no @gmc-cli/config dependency.

/**
 * The slice of gmc config this planner reads. Structurally compatible with
 * `@gmc-cli/config` GmcConfig, but declared locally so the engine stays a leaf.
 * Keep in sync with GmcConfig: if a future config field should influence the
 * migration plan, mirror it here (the CLI passes a GmcConfig in, so TS only
 * checks assignability to this view — extra GmcConfig fields are silently ignored).
 */
export interface ConfigView {
  defaultProfile?: string;
  profiles?: Record<string, { accountId?: string }>;
}

export interface ProfilePlanInput {
  /** Merchant Center account id to write (numeric string). */
  merchantId: string;
  /** Target profile name. */
  profileName: string;
  /** The current on-disk config. */
  existing: ConfigView;
  /** Whether to also make this profile the default. */
  setDefault?: boolean;
}

/** Whether the migration creates a new profile, changes one, or is a no-op. */
export type ProfileAction = "create" | "update" | "noop";

/** The computed migration plan. */
export interface ProfilePlan {
  profileName: string;
  /** The account id that would be written. */
  accountId: string;
  action: ProfileAction;
  /** True when an existing profile points at a *different* account (overwrite). */
  conflict: boolean;
  /** The account id being replaced, when updating. */
  previousAccountId?: string;
  /** True when `defaultProfile` would change to this profile. */
  setsDefault: boolean;
  /** The current default profile, when one is set. */
  previousDefault?: string;
}

/** Compute the {@link ProfilePlan} for migrating `merchantId` into `profileName`. */
export function planProfileMigration(input: ProfilePlanInput): ProfilePlan {
  const { merchantId, profileName, existing, setDefault } = input;
  const current = existing.profiles?.[profileName];

  let action: ProfileAction;
  let conflict = false;
  let previousAccountId: string | undefined;
  if (!current) {
    action = "create";
  } else if (current.accountId === merchantId) {
    action = "noop";
  } else {
    action = "update";
    conflict = current.accountId !== undefined;
    previousAccountId = current.accountId;
  }

  const previousDefault = existing.defaultProfile;
  const setsDefault = Boolean(setDefault) && previousDefault !== profileName;

  const plan: ProfilePlan = {
    profileName,
    accountId: merchantId,
    action,
    conflict,
    setsDefault,
  };
  if (previousAccountId !== undefined) plan.previousAccountId = previousAccountId;
  if (previousDefault !== undefined) plan.previousDefault = previousDefault;
  return plan;
}
