import type { Command } from "commander";
import {
  runDoctor,
  emitJson,
  reportError,
  type DoctorReport,
  type CheckStatus,
} from "@gmc-cli/core";
import { getConfigDir } from "@gmc-cli/config";
import { contextFrom, wantsJson } from "../context.js";

const GLYPH: Record<CheckStatus, string> = { pass: "✓", warn: "⚠", fail: "✗" };

function renderHuman(report: DoctorReport): void {
  const account = report.accountId ? `, account ${report.accountId}` : "";
  process.stdout.write(`gmc doctor — profile "${report.profile}"${account}\n`);
  if (report.identity.email) {
    const project = report.identity.projectId ? ` (project ${report.identity.projectId})` : "";
    process.stdout.write(`identity: ${report.identity.email}${project}\n`);
  }
  process.stdout.write("\n");
  for (const check of report.checks) {
    process.stdout.write(`${GLYPH[check.status]} ${check.title} — ${check.detail}\n`);
    if (check.suggestion && check.status !== "pass") {
      process.stdout.write(`    ${check.suggestion}\n`);
    }
  }
  process.stdout.write(
    `\n${report.ok ? "All checks passed." : "Problems found — see suggestions above."}\n`,
  );
}

/** Register the `gmc doctor` command. */
export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Diagnose auth, GCP registration, and Merchant API access")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const report = await runDoctor({
          configDir: getConfigDir(),
          profile: ctx.profile,
          ...(ctx.accountId ? { accountId: ctx.accountId } : {}),
        });
        if (ctx.json) {
          emitJson(report);
        } else {
          renderHuman(report);
        }
        process.exitCode = report.exitCode;
      } catch (err) {
        reportError(err, { json }, "gmc doctor");
      }
    });
}
