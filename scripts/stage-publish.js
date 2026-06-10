#!/usr/bin/env node
/**
 * Staged publish for @gmc-cli/cli.
 *
 * Packs the cli with `pnpm pack` (which rewrites the `workspace:` refs in the
 * packed manifest), then submits the tarball to npm's STAGING area instead of
 * publishing it live. A maintainer approves the staged package with their passkey
 * on npmjs.com — so CI never needs a long-lived, 2FA-bypassing token.
 *
 * Only the cli is published; the @gmc-cli/* workspace packages are `private`
 * (they're bundled into the cli's dist), so there is exactly one package to stage.
 *
 * Prerequisites (one-time, see RELEASING.md):
 *   - npm >= 11.15.0 (staged publishing)
 *   - a Trusted Publisher (GitHub Actions OIDC) configured for @gmc-cli/cli on npmjs.com
 *
 * Replaces `changeset publish` in the release workflow.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const PKG = "packages/cli";
const { name, version } = JSON.parse(readFileSync(`${PKG}/package.json`, "utf8"));

let registryVersion = null;
try {
  registryVersion = execFileSync("npm", ["view", name, "version"], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
} catch {
  registryVersion = null; // unpublished
}

if (registryVersion === version) {
  console.log(`skip: ${name}@${version} (already published)`);
  process.exit(0);
}

console.log(`staging: ${name}@${version} (registry: ${registryVersion ?? "unpublished"})`);

// pnpm pack rewrites the workspace: protocol in the packed manifest; npm then
// uploads the tarball as-is and never sees a workspace: ref.
execFileSync("pnpm", ["pack"], { cwd: PKG, stdio: "inherit" });
const tarball = readdirSync(PKG).find((f) => f.startsWith("gmc-cli-cli-") && f.endsWith(".tgz"));
if (!tarball) {
  console.error("pack produced no tarball");
  process.exit(1);
}

execFileSync("npm", ["stage", "publish", tarball, "--access", "public"], {
  cwd: PKG,
  stdio: "inherit",
});

console.log(`\nStaged ${name}@${version}. Approve it with your passkey at:`);
console.log("  https://www.npmjs.com/settings/gmc-cli/staged-packages");
console.log("Or locally: npm stage list && npm stage approve <stage-id>");
