import type { Command } from "commander";
import { resolveAuth, AuthError } from "@gmc-cli/auth";
import { probeMerchantApi } from "@gmc-cli/api";
import { emitJson, reportError, UsageError, type CommandContext } from "@gmc-cli/core";
import { getConfigDir, getUserConfigPath, loadConfig, upsertProfile } from "@gmc-cli/config";
import {
  auditScopes,
  parseMerchantInfo,
  planProfileMigration,
  type ProfilePlan,
  type ScopeAuditReport,
} from "@gmc-cli/migrate";
import { contextFrom, wantsJson } from "../context.js";
import { readJsonObject } from "./_shared.js";

// Same status glyphs as `gmc doctor` (doctor.ts) — kept local because the status
// type differs (CheckStatus there vs the migrate report's here).
const GLYPH: Record<ScopeAuditReport["checks"][number]["status"], string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
};

interface ScopesOpts {
  from?: string;
  setDefault?: boolean;
  write?: boolean;
}

/**
 * Best-effort credential + live-probe audit. Never throws: a profile being
 * mid-migration (no working credential yet) is the normal case, so failures
 * become `warn`/`fail` checks inside the report rather than aborting the command.
 */
async function runScopeAudit(ctx: CommandContext): Promise<ScopeAuditReport> {
  let identity: { email: string | null; projectId: string | null } | undefined;
  let probe: { status: "pass" | "warn" | "fail"; message: string; suggestion?: string } | undefined;
  let credentialError: { message: string; suggestion?: string } | undefined;
  let verifyError: string | undefined;

  try {
    const client = await resolveAuth({ cachePath: getConfigDir(), profile: ctx.profile });
    identity = { email: client.getClientEmail(), projectId: client.getProjectId() ?? null };
    try {
      const token = await client.getAccessToken();
      const result = await probeMerchantApi(token, {
        ...(ctx.accountId ? { accountId: ctx.accountId } : {}),
        ...(identity.projectId ? { projectId: identity.projectId } : {}),
      });
      probe = {
        status: result.status,
        message: result.message,
        ...(result.suggestion ? { suggestion: result.suggestion } : {}),
      };
    } catch (err) {
      // Token mint or network failure — capture the cause so the audit reports it
      // instead of a benign "couldn't check"; advise `gmc doctor` for the full one.
      verifyError = err instanceof Error ? err.message : String(err);
    }
  } catch (err) {
    credentialError =
      err instanceof AuthError
        ? { message: err.message, ...(err.suggestion ? { suggestion: err.suggestion } : {}) }
        : { message: err instanceof Error ? err.message : String(err) };
  }

  return auditScopes({
    ...(identity ? { identity } : {}),
    ...(probe ? { probe } : {}),
    ...(credentialError ? { credentialError } : {}),
    ...(verifyError ? { verifyError } : {}),
  });
}

/**
 * Resolve the merchant id to migrate from `--from` (a legacy merchant-info.json)
 * or the resolved `--account`. Returns undefined when neither is given (audit-only).
 */
async function resolveMigrationMerchantId(
  from: string | undefined,
  accountId: string | undefined,
): Promise<string | undefined> {
  if (from) {
    const raw = await readJsonObject(from, "legacy config");
    return parseMerchantInfo(raw).merchantId;
  }
  if (accountId) {
    // Same numeric-id rule as @gmc-cli/config validateConfig and _shared.resolveAccount —
    // checked here so a bad --account fails before the (dry-run) plan, not only on write.
    if (!/^\d+$/.test(accountId)) {
      throw new UsageError(
        `Invalid account id "${accountId}".`,
        "Account ids are numeric, e.g. 123456789.",
      );
    }
    return accountId;
  }
  return undefined;
}

function renderAudit(audit: ScopeAuditReport): void {
  process.stdout.write("gmc migrate scopes — Content API → Merchant API\n\n");

  if (audit.scopeUnchanged) {
    process.stdout.write(
      "OAuth scope: unchanged. The Merchant API uses the same scope as the Content API:\n" +
        `  ${audit.legacyScope}\n` +
        "Existing tokens keep working — no re-consent is required today.\n\n",
    );
  } else {
    process.stdout.write("OAuth scope: the Merchant API now uses per-sub-API scopes:\n");
    for (const m of audit.mapping) {
      process.stdout.write(`  ${m.subApi.padEnd(12)}${m.scopes.join(", ")}\n`);
    }
    process.stdout.write("\n");
  }

  for (const c of audit.checks) {
    process.stdout.write(`${GLYPH[c.status]} ${c.title} — ${c.detail}\n`);
    if (c.suggestion && c.status !== "pass") process.stdout.write(`    ${c.suggestion}\n`);
  }
  if (audit.checks.length) process.stdout.write("\n");
}

function renderPlan(plan: ProfilePlan, written: boolean, configPath: string): void {
  const { profileName } = plan;
  process.stdout.write("Config migration\n");

  if (plan.action === "noop" && !plan.setsDefault) {
    process.stdout.write(
      `  Profile "${profileName}" already targets account ${plan.accountId}. Nothing to do.\n`,
    );
    return;
  }

  if (plan.action !== "noop") {
    const verb = written ? (plan.action === "create" ? "Created" : "Updated") : `Would ${plan.action}`;
    process.stdout.write(`  ${verb} profile "${profileName}" → account ${plan.accountId}.\n`);
    if (plan.conflict) process.stdout.write(`    (was account ${plan.previousAccountId})\n`);
  }
  if (plan.setsDefault) {
    const was = plan.previousDefault ? ` (was "${plan.previousDefault}")` : "";
    process.stdout.write(
      `  ${written ? "Set" : "Would set"} "${profileName}" as the default profile${was}.\n`,
    );
  }
  process.stdout.write(
    written
      ? `  Wrote ${configPath}. Verify with \`gmc doctor\`.\n`
      : "  Re-run with --write to apply.\n",
  );
}

/** Register the `gmc migrate` command group. Phase 5: `scopes` (v0.9.6). */
export function registerMigrateCommands(program: Command): void {
  const migrate = program
    .command("migrate")
    .description("Migrate a Content API for Shopping setup to the Merchant API");

  migrate
    .command("scopes")
    .description(
      "Audit Content API → Merchant API auth and migrate a legacy config into a gmc profile",
    )
    .option("--from <path>", "Legacy Content API merchant-info.json to import")
    .option("--set-default", "Make the migrated profile the default")
    .option("--write", "Write the migrated profile to config.json (otherwise dry-run)")
    .action(async (opts: ScopesOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);

        // 1. Auth/scope audit (offline scope model + best-effort live probe).
        const audit = await runScopeAudit(ctx);

        // 2. Optional config migration: dry-run a plan, apply it with --write.
        // Resolve the path once and reuse it for the plan read, the write, and the
        // rendered "Wrote …" line, so all three name the same file.
        const configPath = getUserConfigPath();
        let plan: ProfilePlan | undefined;
        let written = false;
        const merchantId = await resolveMigrationMerchantId(opts.from, ctx.accountId);
        if (merchantId) {
          plan = planProfileMigration({
            merchantId,
            profileName: ctx.profile,
            existing: loadConfig(configPath),
            setDefault: Boolean(opts.setDefault),
          });
          // Skip the write when there's genuinely nothing to change.
          if (opts.write && (plan.action !== "noop" || plan.setsDefault)) {
            await upsertProfile(
              ctx.profile,
              { accountId: merchantId },
              { setDefault: Boolean(opts.setDefault), configPath },
            );
            written = true;
          }
        }

        if (ctx.json) {
          emitJson({ audit, ...(plan ? { plan } : {}), written });
        } else {
          renderAudit(audit);
          if (plan) renderPlan(plan, written, configPath);
        }
        // Advisory by design — exit 0. Only usage/IO errors (thrown above) fail.
      } catch (err) {
        reportError(err, { json }, "gmc migrate scopes");
      }
    });
}
