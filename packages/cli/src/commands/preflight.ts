import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import { ProductsService, toProductInput, type ProductInput } from "@gmc-cli/api";
import {
  runPreflight,
  loadPreflightConfig,
  gate,
  findingComparator,
  RULES,
  type Finding,
  type FindingCounts,
  type PreflightConfig,
  type PreflightReport,
  type Rule,
  type Severity,
} from "@gmc-cli/preflight";
import { contextFrom, wantsJson } from "../context.js";
import {
  clientFor,
  resolveAccount,
  parsePageSize,
  loadProductFiles,
  type FileLoadFailure,
} from "./_shared.js";

const DEFAULT_DIR = "feeds";

const GLYPH: Record<Severity, string> = { error: "✗", warning: "⚠", info: "ℹ" };

interface PreflightOpts {
  dir: string;
  file?: string;
  remote?: boolean;
  config?: string;
  strict?: boolean;
  rule?: string[];
  pageSize?: string;
}

/** Restrict the rule set to the named ids, or throw a UsageError listing every bad one. */
function selectRules(ids: string[]): Rule[] {
  const known = new Map(RULES.map((r) => [r.id, r]));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) {
    throw new UsageError(
      `Unknown rule ${unknown.map((id) => `"${id}"`).join(", ")}.`,
      `Valid rule ids: ${RULES.map((r) => r.id).join(", ")}.`,
    );
  }
  return ids.map((id) => known.get(id) as Rule);
}

// A file that won't parse can't be assessed, so it's always an error finding —
// intentionally NOT configurable via `.gmcpreflightrc` (`rules`/`ignore`), unlike a
// real rule. `productKey` is the filename, the only identity an unparseable file has.
function parseFailureFinding(failure: FileLoadFailure): Finding {
  return {
    ruleId: "preflight.parse-error",
    severity: "error",
    productKey: failure.file,
    offerId: null,
    message: `Could not parse ${failure.file}: ${failure.error}.`,
    suggestion: "Fix the file so it's a single product-input JSON object.",
  };
}

/**
 * Fold file parse failures into the engine report as error findings, then
 * recompute the gate. The engine only sees parsed products; bad files are the
 * CLI's concern, but they must still fail the run and appear in the report.
 */
function withParseFailures(report: PreflightReport, failures: FileLoadFailure[]): PreflightReport {
  if (failures.length === 0) return report;
  const findings = [...failures.map(parseFailureFinding), ...report.findings];
  findings.sort(findingComparator);
  const counts: FindingCounts = { ...report.counts, error: report.counts.error + failures.length };
  // Reuse the engine's gate so the exit-code contract can't diverge from runPreflight.
  return { ...report, ...gate(counts, report.strict), counts, findings };
}

/** Read and parse a single product file; an unreadable path is usage, bad JSON a finding. */
async function loadSingleFile(
  file: string,
): Promise<{ products: ProductInput[]; failures: FileLoadFailure[] }> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new UsageError(
      `Could not read file "${file}".`,
      "Check the path is correct and readable.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { products: [], failures: [{ file: basename(file), error: "invalid JSON" }] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { products: [], failures: [{ file: basename(file), error: "not a JSON object" }] };
  }
  return { products: [parsed as ProductInput], failures: [] };
}

function renderHuman(report: PreflightReport, configPath: string | undefined): void {
  let header = `gmc preflight — scanned ${report.scanned} product(s)`;
  if (configPath) header += ` · config ${configPath}`;
  process.stdout.write(`${header}\n`);

  if (report.findings.length === 0) {
    process.stdout.write("\n✓ No issues found.\n");
    return;
  }

  // Findings arrive sorted by product, so consecutive entries group cleanly.
  const groups = new Map<string, Finding[]>();
  for (const f of report.findings) {
    const arr = groups.get(f.productKey);
    if (arr) arr.push(f);
    else groups.set(f.productKey, [f]);
  }
  for (const [key, fs] of groups) {
    process.stdout.write(`\n${key || "(unidentified product)"}\n`);
    for (const f of fs) {
      const attr = f.attribute ? `${f.attribute} — ` : "";
      process.stdout.write(`  ${GLYPH[f.severity]} ${attr}${f.message}\n`);
      if (f.suggestion) process.stdout.write(`      → ${f.suggestion}\n`);
    }
  }

  const { error, warning, info } = report.counts;
  const parts: string[] = [];
  if (error) parts.push(`${error} error${error === 1 ? "" : "s"}`);
  if (warning) parts.push(`${warning} warning${warning === 1 ? "" : "s"}`);
  if (info) parts.push(`${info} info`);
  process.stdout.write(`\n${parts.join(", ")} across ${groups.size} product(s).\n`);
  if (report.ok) {
    process.stdout.write("Passed — no gating findings.\n");
  } else {
    process.stdout.write(
      report.strict ? "Failed — strict mode counts warnings as failures.\n" : "Failed.\n",
    );
  }
}

/** Register the `gmc preflight` command. */
export function registerPreflightCommand(program: Command): void {
  program
    .command("preflight")
    .description(
      "Scan product files for Merchant Center compliance issues — offline, before upload",
    )
    .option("--dir <path>", "Directory of product files to scan", DEFAULT_DIR)
    .option("--file <path>", "Scan a single product file instead of a directory")
    .option("--remote", "Pull the live catalog and scan it (needs auth)")
    .option("--config <path>", "Path to a .gmcpreflightrc (overrides discovery)")
    .option("--strict", "Treat warnings as failures (non-zero exit)")
    .option("--rule <id...>", "Only run the named rule(s)")
    .option("--page-size <n>", "Max products per API page (with --remote)")
    .action(async (opts: PreflightOpts) => {
      const json = wantsJson(program);
      try {
        // 1. Source products: live catalog (--remote), a single file, or a directory.
        let products: ProductInput[];
        let failures: FileLoadFailure[] = [];
        if (opts.remote) {
          const ctx = contextFrom(program);
          const account = resolveAccount(undefined, ctx);
          const pageSize = parsePageSize(opts.pageSize);
          const service = new ProductsService(await clientFor(ctx, account));
          const remote = await service.listProducts(pageSize ? { pageSize } : {});
          products = remote.map(toProductInput);
        } else if (opts.file) {
          ({ products, failures } = await loadSingleFile(opts.file));
        } else {
          const loaded = await loadProductFiles(opts.dir);
          products = loaded.files.map((f) => f.input);
          failures = loaded.failures;
        }

        // 2. Load .gmcpreflightrc — discovered from the scanned location (or --config).
        const startDir = opts.file
          ? dirname(resolve(opts.file))
          : opts.remote
            ? process.cwd()
            : resolve(opts.dir);
        const { config: fileConfig, path: configPath } = loadPreflightConfig(
          opts.config ? { configPath: opts.config } : { cwd: startDir },
        );
        const config: PreflightConfig = { ...fileConfig };
        if (opts.strict) config.strict = true;

        // 3. Run the engine and fold in any unparseable files.
        const rules = opts.rule ? selectRules(opts.rule) : undefined;
        const report = withParseFailures(runPreflight(products, config, rules), failures);

        if (json) {
          emitJson(report);
        } else {
          renderHuman(report, configPath);
        }
        process.exitCode = report.exitCode;
      } catch (err) {
        reportError(err, { json }, "gmc preflight");
      }
    });
}
