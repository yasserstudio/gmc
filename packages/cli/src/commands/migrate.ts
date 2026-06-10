import type { Command } from "commander";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { resolveAuth, AuthError } from "@gmc-cli/auth";
import {
  probeMerchantApi,
  productKey,
  ProductsService,
  DataSourcesService,
  type DataSource,
} from "@gmc-cli/api";
import { emitJson, reportError, ExitCode, UsageError, type CommandContext } from "@gmc-cli/core";
import { getConfigDir, getUserConfigPath, loadConfig, upsertProfile } from "@gmc-cli/config";
import {
  auditScopes,
  parseMerchantInfo,
  planProfileMigration,
  transformProduct,
  isTransformError,
  checkFeedLabels,
  type ProfilePlan,
  type ScopeAuditReport,
  type FeedLabelProduct,
  type FeedLabelSource,
  type FeedLabelReport,
} from "@gmc-cli/migrate";
import { contextFrom, wantsJson } from "../context.js";
import {
  clientFor,
  loadProductFiles,
  parsePageSize,
  productFileName,
  readJsonObject,
  resolveAccount,
} from "./_shared.js";

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

interface ProductsOpts {
  from: string;
  file?: string;
  out: string;
  feedLabel?: string;
}

/** A loaded Content API source product, or a load error (e.g. unparseable file). */
interface ContentSource {
  label: string;
  raw?: unknown;
  error?: string;
}

/** Per-product transform notes for the report (only shown when non-empty). */
interface ProductReportEntry {
  key: string;
  remapped: string[];
  dropped: string[];
  warnings: string[];
}

/** Pull the product list out of a single product, a bare array, or a list response. */
function extractProducts(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed !== null && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o["resources"])) return o["resources"]; // Content API list response
    if (Array.isArray(o["products"])) return o["products"];
    return [parsed]; // a single product object
  }
  return [parsed]; // non-object — transformProduct will report it
}

/** A human-friendly label for a source product (its offer/id, else a positional one). */
function offerIdHint(raw: unknown): string | undefined {
  if (raw !== null && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o["offerId"] === "string" && o["offerId"]) return o["offerId"];
    if (typeof o["id"] === "string" && o["id"]) return o["id"];
  }
  return undefined;
}

/** Read `--file`: a single product, a JSON array, or a products.list response. */
async function loadContentApiFile(file: string): Promise<ContentSource[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new UsageError(`Could not read "${file}".`, "Check the path is correct and readable.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(
      `"${file}" is not valid JSON.`,
      "Provide a Content API product, a JSON array, or a products.list response.",
    );
  }
  const base = basename(file);
  return extractProducts(parsed).map((item, i) => ({
    label: offerIdHint(item) ?? `${base}[${i}]`,
    raw: item,
  }));
}

/**
 * Read `--from`: every `*.json` in a directory. Each file may itself be a single
 * product, an array, or a `products.list` response — same shapes as `--file` —
 * so they're fanned out via {@link extractProducts}. An unparseable file becomes
 * a load error.
 */
async function loadContentApiDir(dir: string): Promise<ContentSource[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new UsageError(
      `Could not read directory "${dir}".`,
      "Pass --from <dir> to a directory of Content API product files, or --file <path>.",
    );
  }
  const sources: ContentSource[] = [];
  for (const name of entries.filter((f) => f.endsWith(".json")).sort()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(dir, name), "utf8"));
    } catch {
      sources.push({ label: name, error: "invalid JSON" });
      continue;
    }
    const items = extractProducts(parsed);
    items.forEach((raw, i) => {
      sources.push({ label: items.length > 1 ? `${name}[${i}]` : name, raw });
    });
  }
  return sources;
}

function renderProductsReport(
  out: string,
  written: string[],
  report: ProductReportEntry[],
  errors: { source: string; error: string }[],
): void {
  process.stdout.write(`gmc migrate products — converted ${written.length} product(s) to ${out}\n`);
  for (const e of report) {
    if (!e.remapped.length && !e.dropped.length && !e.warnings.length) continue;
    process.stdout.write(`\n${e.key}\n`);
    for (const r of e.remapped) process.stdout.write(`  ~ ${r}\n`);
    if (e.dropped.length) process.stdout.write(`  - dropped: ${e.dropped.join(", ")}\n`);
    for (const w of e.warnings) process.stdout.write(`  ⚠ ${w}\n`);
  }
  if (errors.length) {
    process.stdout.write(`\nCould not convert ${errors.length} product(s):\n`);
    for (const e of errors) process.stdout.write(`  ✗ ${e.source}: ${e.error}\n`);
  }
  process.stdout.write(
    `\n${written.length} converted${errors.length ? `, ${errors.length} error(s)` : ""}.\n`,
  );
}

interface FeedLabelsOpts {
  dir: string;
  remote?: boolean;
  strict?: boolean;
  pageSize?: string;
}

const FL_GLYPH: Record<FeedLabelReport["findings"][number]["severity"], string> = {
  error: "✗",
  warning: "⚠",
  info: "ℹ",
};

/** The feed identity of a primary data source, or null for non-primary sources. */
function primarySource(ds: DataSource): FeedLabelSource | null {
  const p = ds.primaryProductDataSource;
  if (!p) return null;
  const s: FeedLabelSource = {};
  if (p.channel !== undefined) s.channel = p.channel;
  if (p.feedLabel !== undefined) s.feedLabel = p.feedLabel;
  if (p.contentLanguage !== undefined) s.contentLanguage = p.contentLanguage;
  return s;
}

function renderFeedLabels(report: FeedLabelReport, notes: string[]): void {
  process.stdout.write(
    `gmc migrate feed-labels — scanned ${report.scanned} product(s) across ${report.groups.length} feed-label group(s)\n`,
  );
  for (const note of notes) process.stdout.write(`${note}\n`);

  if (report.groups.length) {
    process.stdout.write("\nfeed labels:\n");
    for (const g of report.groups) {
      const label = g.feedLabel || "(none)";
      const lang = g.contentLanguage || "—";
      const mark =
        report.crossChecked && g.feedLabel
          ? g.matched
            ? "  ✓ matches a data source"
            : "  ✗ no matching data source"
          : "";
      process.stdout.write(`  ${label} / ${lang}  ${g.count} product(s)${mark}\n`);
    }
  }

  if (report.findings.length) {
    process.stdout.write("\n");
    for (const f of report.findings) {
      process.stdout.write(`${FL_GLYPH[f.severity]} ${f.message}\n`);
      if (f.suggestion) process.stdout.write(`    → ${f.suggestion}\n`);
    }
  }

  const { error, warning, info } = report.counts;
  const parts: string[] = [];
  if (error) parts.push(`${error} error${error === 1 ? "" : "s"}`);
  if (warning) parts.push(`${warning} warning${warning === 1 ? "" : "s"}`);
  if (info) parts.push(`${info} info`);
  process.stdout.write(
    `\n${parts.length ? parts.join(", ") : "No issues"} across ${report.groups.length} group(s).\n`,
  );
  if (report.ok) {
    process.stdout.write("Passed.\n");
  } else {
    process.stdout.write(
      report.strict ? "Failed — strict mode counts warnings as failures.\n" : "Failed.\n",
    );
  }
}

/** Register the `gmc migrate` command group. Phase 5: `scopes` (v0.9.6), `products` (v0.9.7), `feed-labels` (v0.9.8). */
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

  migrate
    .command("products")
    .description(
      "Convert Content API v2.1 product JSON to push-ready Merchant API ProductInput files",
    )
    .option("--from <dir>", "Directory of Content API product JSON files", "content")
    .option("--file <path>", "A single product, a JSON array, or a products.list response")
    .option("--out <dir>", "Output directory for ProductInput files", "feeds")
    .option("--feed-label <label>", "Override feedLabel for every product")
    .action(async (opts: ProductsOpts) => {
      const json = wantsJson(program);
      try {
        // --file takes precedence over --from.
        const sources = opts.file
          ? await loadContentApiFile(opts.file)
          : await loadContentApiDir(opts.from);

        const written: string[] = [];
        const report: ProductReportEntry[] = [];
        const errors: { source: string; error: string }[] = [];
        const seen = new Set<string>();
        // Create the output dir lazily, only once there's a product to write, so a
        // run that converts nothing doesn't leave an empty directory behind.
        let outReady = false;

        for (const source of sources) {
          if (source.error) {
            errors.push({ source: source.label, error: source.error });
            continue;
          }
          const result = transformProduct(source.raw);
          if (isTransformError(result)) {
            errors.push({ source: source.label, error: result.error });
            continue;
          }
          const { input, remapped, dropped, warnings } = result;
          if (opts.feedLabel) {
            remapped.push(`feedLabel overridden → "${opts.feedLabel}" (--feed-label)`);
            input.feedLabel = opts.feedLabel;
          }
          const name = productFileName(input);
          if (!name) {
            errors.push({ source: source.label, error: "no id to name the output file" });
            continue;
          }
          // Don't silently overwrite a file already written this run (id collision).
          if (seen.has(name)) {
            errors.push({ source: source.label, error: `duplicate product id (${name})` });
            continue;
          }
          seen.add(name);
          if (!outReady) {
            await mkdir(opts.out, { recursive: true });
            outReady = true;
          }
          await writeFile(join(opts.out, name), `${JSON.stringify(input, null, 2)}\n`);
          written.push(name);
          report.push({ key: productKey(input), remapped, dropped, warnings });
        }

        if (json) {
          emitJson({
            converted: written.length,
            out: opts.out,
            written,
            products: report.filter(
              (e) => e.remapped.length || e.dropped.length || e.warnings.length,
            ),
            ...(errors.length ? { errors } : {}),
          });
        } else {
          renderProductsReport(opts.out, written, report, errors);
        }
        // A product that couldn't be converted fails the run, so CI gates an
        // incomplete migration (the good products are still written).
        if (errors.length) process.exitCode = ExitCode.Error;
      } catch (err) {
        reportError(err, { json }, "gmc migrate products");
      }
    });

  migrate
    .command("feed-labels")
    .description("Check migrated feed labels resolve to feeds your campaigns target")
    .option("--dir <path>", "Directory of product files to check", "feeds")
    .option("--remote", "Pull and check the live catalog instead (needs auth)")
    .option("--strict", "Treat warnings as failures (non-zero exit)")
    .option("--page-size <n>", "Max products per API page (with --remote)")
    .action(async (opts: FeedLabelsOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const pageSize = parsePageSize(opts.pageSize);
        const notes: string[] = [];

        // 1. Products: live catalog (--remote) or a local feed dir.
        let products: FeedLabelProduct[];
        // dataSources stays undefined for offline-only analysis (skips the cross-check rules).
        let dataSources: FeedLabelSource[] | undefined;

        if (opts.remote) {
          const account = resolveAccount(undefined, ctx);
          const client = await clientFor(ctx, account);
          products = await new ProductsService(client).listProducts(pageSize ? { pageSize } : {});
          dataSources = (await new DataSourcesService(client).listDataSources())
            .map(primarySource)
            .filter((s): s is FeedLabelSource => s !== null);
        } else {
          const loaded = await loadProductFiles(opts.dir);
          products = loaded.files.map((f) => f.input);
          if (loaded.failures.length) {
            notes.push(`Skipped ${loaded.failures.length} unparseable file(s).`);
          }
          // Best-effort cross-check when an account is configured; offline otherwise.
          if (ctx.accountId && !/^\d+$/.test(ctx.accountId)) {
            // Distinguish a misconfigured id from an unreachable account so the
            // note doesn't misdiagnose a setup error as a network problem.
            notes.push(`Cross-check skipped — invalid account id "${ctx.accountId}".`);
          } else if (ctx.accountId) {
            try {
              const client = await clientFor(ctx, ctx.accountId);
              dataSources = (await new DataSourcesService(client).listDataSources())
                .map(primarySource)
                .filter((s): s is FeedLabelSource => s !== null);
            } catch {
              notes.push("Cross-check skipped — couldn't reach the account's data sources.");
            }
          } else {
            notes.push("Cross-check skipped — no account configured (offline analysis only).");
          }
          if (loaded.failures.length) process.exitCode = ExitCode.Error;
        }

        const report = checkFeedLabels(products, {
          ...(dataSources ? { dataSources } : {}),
          strict: Boolean(opts.strict),
        });

        if (json) {
          emitJson({ ...report, ...(notes.length ? { notes } : {}) });
        } else {
          renderFeedLabels(report, notes);
        }
        if (!report.ok) process.exitCode = ExitCode.Error;
      } catch (err) {
        reportError(err, { json }, "gmc migrate feed-labels");
      }
    });
}
