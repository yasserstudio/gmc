import type { Command } from "commander";
import { emitJson, reportError } from "@gmc-cli/core";
import { IssuesService, type RenderedIssue, type IssueBreakdown } from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount } from "./_shared.js";

interface RenderFlags {
  language?: string;
  timeZone?: string;
}

function renderOptions(opts: RenderFlags): { languageCode?: string; timeZone?: string } {
  return { languageCode: opts.language, timeZone: opts.timeZone };
}

/** Region list of one breakdown, name preferred over code. */
function regionsOf(breakdown: IssueBreakdown): string {
  return (breakdown.regions ?? [])
    .map((r) => r.name ?? r.code)
    .filter((s): s is string => Boolean(s))
    .join(", ");
}

/** One issue: severity-tagged title, impact message, then region breakdowns. */
function renderIssueBlock(issue: RenderedIssue): void {
  const severity = issue.impact?.severity;
  const tag = severity && severity !== "SEVERITY_UNSPECIFIED" ? severity : "ISSUE";
  process.stdout.write(`\n  [${tag}] ${issue.title ?? "(untitled issue)"}\n`);
  if (issue.impact?.message) process.stdout.write(`    ${issue.impact.message}\n`);
  for (const b of issue.impact?.breakdowns ?? []) {
    const line = [regionsOf(b), (b.details ?? []).join("; ")].filter(Boolean).join(" — ");
    if (line) process.stdout.write(`      • ${line}\n`);
  }
}

function renderIssues(issues: RenderedIssue[], emptyMsg: string): void {
  if (issues.length === 0) {
    process.stdout.write(`${emptyMsg}\n`);
    return;
  }
  process.stdout.write(`${issues.length} issue(s):\n`);
  for (const issue of issues) renderIssueBlock(issue);
  if (issues.some((i) => i.prerenderedContent)) {
    process.stdout.write("\nFull HTML detail is in --json (prerenderedContent).\n");
  }
}

/** Register the `gmc issues` command group (read-only account + product renders). */
export function registerIssuesCommands(program: Command): void {
  const issues = program
    .command("issues")
    .description("Render Merchant Center account & product issues with resolution content");

  issues
    .command("account")
    .description("Render account-level issues — why the account is limited and how to fix it")
    .option("--language <code>", "IETF BCP-47 language for rendered content (default: en-US)")
    .option("--time-zone <tz>", "IANA time zone for rendered times (default: UTC)")
    .action(async (opts: RenderFlags) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new IssuesService(await clientFor(ctx, account));
        const list = await service.renderAccountIssues(renderOptions(opts));
        if (ctx.json) emitJson({ issues: list });
        else renderIssues(list, "No account issues for this account.");
      } catch (err) {
        reportError(err, { json }, "gmc issues account");
      }
    });

  issues
    .command("product")
    .argument("<productId>", "Product id or resource name (from `products list`)")
    .description("Render item-level issues for one product")
    .option("--language <code>", "IETF BCP-47 language for rendered content (default: en-US)")
    .option("--time-zone <tz>", "IANA time zone for rendered times (default: UTC)")
    .action(async (productId: string, opts: RenderFlags) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new IssuesService(await clientFor(ctx, account));
        const list = await service.renderProductIssues(productId, renderOptions(opts));
        if (ctx.json) emitJson({ issues: list });
        else renderIssues(list, "No issues for this product.");
      } catch (err) {
        reportError(err, { json }, "gmc issues product");
      }
    });
}
