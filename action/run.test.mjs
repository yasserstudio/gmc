// action/run.test.mjs — tests for the GitHub Action runner.
// Runs under Node; validates annotation output, summary, and outputs
// by intercepting console.log and file writes.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

// We test by running run.mjs as a child process with controlled env vars.
// This requires `gmc` to be on PATH (built locally).
const GMC_BIN = join(__dirname, "..", "packages", "cli", "dist", "bin.js");

function runAction(env, cwd) {
  const tmp = mkdtempSync(join(tmpdir(), "gmc-action-"));
  const outputFile = join(tmp, "output");
  const summaryFile = join(tmp, "summary");
  writeFileSync(outputFile, "");
  writeFileSync(summaryFile, "");

  const fullEnv = {
    ...process.env,
    GITHUB_OUTPUT: outputFile,
    GITHUB_STEP_SUMMARY: summaryFile,
    GMC_ARGS: "",
    PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
    ...env,
  };

  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    stdout = execFileSync(process.execPath, [join(__dirname, "run.mjs")], {
      encoding: "utf8",
      cwd: cwd || tmp,
      env: fullEnv,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    stdout = err.stdout ?? "";
    stderr = err.stderr ?? "";
    exitCode = err.status ?? 1;
  }

  return {
    stdout,
    stderr,
    exitCode,
    outputs: readFileSync(outputFile, "utf8"),
    summary: readFileSync(summaryFile, "utf8"),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

// Build a minimal feeds dir with product files.
function makeFeedsDir(products) {
  const tmp = mkdtempSync(join(tmpdir(), "gmc-feeds-"));
  const feedsDir = join(tmp, "feeds");
  mkdirSync(feedsDir);
  for (const [name, data] of Object.entries(products)) {
    writeFileSync(join(feedsDir, name), JSON.stringify(data));
  }
  return { root: tmp, feedsDir, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

const GOOD_PRODUCT = {
  offerId: "SKU-GOOD",
  contentLanguage: "en",
  feedLabel: "US",
  productAttributes: {
    title: "A valid product with a sufficiently descriptive title",
    description: "A detailed description of this product for shoppers",
    link: "https://example.com/product",
    imageLink: "https://example.com/image.jpg",
    availability: "in_stock",
    price: { amountMicros: "19990000", currencyCode: "USD" },
    condition: "new",
  },
};

const BAD_PRODUCT = {
  offerId: "SKU-BAD",
  contentLanguage: "en",
  feedLabel: "US",
  productAttributes: {},
};

describe("action/run.mjs", () => {
  let checkGmc;

  before(() => {
    // Verify gmc is runnable
    try {
      execFileSync(process.execPath, [GMC_BIN, "--version"], { encoding: "utf8" });
      checkGmc = true;
    } catch {
      checkGmc = false;
    }
  });

  it("passes on a clean feed", function () {
    if (!checkGmc) {
      this.skip();
      return;
    }

    const { root, cleanup: cleanupFeeds } = makeFeedsDir({ "SKU-GOOD.json": GOOD_PRODUCT });
    const result = runAction({ GMC_ARGS: `--dir ${join(root, "feeds")}` });

    try {
      assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}\n${result.stderr}`);
      assert.ok(result.outputs.includes("ok=true"));
      assert.ok(result.outputs.includes("errors=0"));
      assert.ok(result.summary.includes("**Passed**"));
    } finally {
      result.cleanup();
      cleanupFeeds();
    }
  });

  it("fails with annotations on a bad feed", function () {
    if (!checkGmc) {
      this.skip();
      return;
    }

    const { root, cleanup: cleanupFeeds } = makeFeedsDir({ "SKU-BAD.json": BAD_PRODUCT });
    const result = runAction({ GMC_ARGS: `--dir ${join(root, "feeds")}` });

    try {
      assert.notEqual(result.exitCode, 0, "expected non-zero exit");
      assert.ok(result.outputs.includes("ok=false"));
      assert.ok(result.stdout.includes("::error"), "expected error annotations");
      assert.ok(result.summary.includes("**Failed**"));
      assert.ok(result.summary.includes("SKU-BAD"));
    } finally {
      result.cleanup();
      cleanupFeeds();
    }
  });

  it("sets the scanned count output", function () {
    if (!checkGmc) {
      this.skip();
      return;
    }

    const { root, cleanup: cleanupFeeds } = makeFeedsDir({
      "A.json": GOOD_PRODUCT,
      "B.json": { ...GOOD_PRODUCT, offerId: "SKU-B" },
    });
    const result = runAction({ GMC_ARGS: `--dir ${join(root, "feeds")}` });

    try {
      assert.ok(result.outputs.includes("scanned=2"), `expected scanned=2 in: ${result.outputs}`);
    } finally {
      result.cleanup();
      cleanupFeeds();
    }
  });

  it("includes the full report as JSON output", function () {
    if (!checkGmc) {
      this.skip();
      return;
    }

    const { root, cleanup: cleanupFeeds } = makeFeedsDir({ "SKU-GOOD.json": GOOD_PRODUCT });
    const result = runAction({ GMC_ARGS: `--dir ${join(root, "feeds")}` });

    try {
      const match = result.outputs.match(/report<<(GMC_EOF_[\w-]+)\n([\s\S]*?)\n\1/);
      assert.ok(match, "expected report multiline output");
      const report = JSON.parse(match[2]);
      assert.equal(report.ok, true);
      assert.equal(typeof report.scanned, "number");
    } finally {
      result.cleanup();
      cleanupFeeds();
    }
  });

  it("exits with error when gmc produces no JSON", function () {
    if (!checkGmc) {
      this.skip();
      return;
    }

    const result = runAction({
      GMC_ARGS: "--dir /nonexistent/path/that/does/not/exist",
    });

    try {
      assert.notEqual(result.exitCode, 0);
    } finally {
      result.cleanup();
    }
  });

  it("handles an empty directory gracefully", function () {
    if (!checkGmc) {
      this.skip();
      return;
    }

    const { root, cleanup: cleanupFeeds } = makeFeedsDir({});
    const result = runAction({ GMC_ARGS: `--dir ${join(root, "feeds")}` });

    try {
      assert.equal(result.exitCode, 0);
      assert.ok(result.outputs.includes("scanned=0"));
    } finally {
      result.cleanup();
      cleanupFeeds();
    }
  });
});
