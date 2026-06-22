// action/run.mjs — enhanced preflight runner for GitHub Actions.
// Runs `gmc preflight --json`, emits inline annotations, writes a job summary
// table, and sets structured outputs so downstream steps can branch on results.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// GitHub Actions workflow-command escaping (mirrors @actions/core/command.ts).
function escapeData(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(s) {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

const { GMC_ARGS = "", GITHUB_OUTPUT = "", GITHUB_STEP_SUMMARY = "" } = process.env;

const extraArgs = GMC_ARGS.split(/\s+/).filter(Boolean);
const args = ["preflight", "--json", ...extraArgs];

let stdout = "";
let exitCode = 0;
try {
  stdout = execFileSync("gmc", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
} catch (err) {
  stdout = err.stdout ?? "";
  exitCode = err.status ?? 1;
}

let report;
try {
  report = JSON.parse(stdout);
} catch {
  process.stderr.write(stdout || "(no output)\n");
  console.log("::error::gmc preflight did not produce JSON output.");
  process.exit(exitCode || 1);
}

// ---------------------------------------------------------------------------
// Resolve the feed directory / single file from args (for file-level annotations)
// ---------------------------------------------------------------------------
let dir = "feeds";
const dirIdx = extraArgs.indexOf("--dir");
if (dirIdx !== -1 && extraArgs[dirIdx + 1]) dir = extraArgs[dirIdx + 1];
const fileIdx = extraArgs.indexOf("--file");
const singleFile = fileIdx !== -1 ? extraArgs[fileIdx + 1] : null;

// ---------------------------------------------------------------------------
// Annotations — maps findings to source files when possible
// ---------------------------------------------------------------------------
for (const f of report.findings) {
  const level = f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "notice";

  let filePart = "";
  if (singleFile) {
    filePart = ` file=${escapeProperty(singleFile)}`;
  } else if (f.ruleId === "preflight.parse-error") {
    filePart = ` file=${escapeProperty(join(dir, f.productKey))}`;
  } else if (f.offerId) {
    const candidate = join(dir, `${f.offerId}.json`);
    if (existsSync(candidate)) filePart = ` file=${escapeProperty(candidate)}`;
  }

  const msg = f.suggestion ? `${f.message} — ${f.suggestion}` : f.message;
  console.log(`::${level}${filePart}::${escapeData(`${f.ruleId}: ${msg}`)}`);
}

// ---------------------------------------------------------------------------
// Job summary
// ---------------------------------------------------------------------------
const lines = ["## GMC Preflight", ""];

if (report.ok) {
  lines.push(`**Passed** — ${report.scanned} product(s) scanned, no gating issues.`);
} else {
  lines.push(
    `**Failed** — ${report.counts.error} error(s), ${report.counts.warning} warning(s) across ${report.scanned} product(s).`,
  );
  if (report.findings.length > 0) {
    lines.push(
      "",
      "| Severity | Rule | Product | Message |",
      "|----------|------|---------|---------|",
    );
    for (const f of report.findings) {
      const esc = (s) => s.replace(/\|/g, "\\|");
      const product = esc(f.offerId ?? f.productKey ?? "—");
      const message = esc(f.message);
      lines.push(`| ${f.severity} | \`${esc(f.ruleId)}\` | \`${product}\` | ${message} |`);
    }
  }
}

if (report.strict) lines.push("", "*Strict mode: warnings treated as errors.*");
lines.push(
  "",
  `<sub>scanned ${report.scanned} · <a href="https://yasserstudio.github.io/gmc/reference/preflight">gmc preflight</a></sub>`,
);

if (GITHUB_STEP_SUMMARY) {
  appendFileSync(GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
function setOutput(key, value) {
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`);
}

setOutput("ok", String(report.ok));
setOutput("scanned", String(report.scanned));
setOutput("errors", String(report.counts.error));
setOutput("warnings", String(report.counts.warning));

if (GITHUB_OUTPUT) {
  const delim = `GMC_EOF_${randomUUID()}`;
  appendFileSync(GITHUB_OUTPUT, `report<<${delim}\n${JSON.stringify(report)}\n${delim}\n`);
}

process.exitCode = report.exitCode;
