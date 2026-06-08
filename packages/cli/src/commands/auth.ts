import type { Command } from "commander";
import {
  resolveAuth,
  loginWithOAuth,
  loadStoredCredential,
  clearStoredCredential,
  clearTokenCache,
} from "@gmc-cli/auth";
import type { AuthClient } from "@gmc-cli/auth";
import { getConfigDir } from "@gmc-cli/config";
import { emitJson, reportError, type CommandContext } from "@gmc-cli/core";
import { contextFrom, wantsJson } from "../context.js";

function printIdentity(client: AuthClient, ctx: CommandContext, successText: string): void {
  const identity = { email: client.getClientEmail(), projectId: client.getProjectId() ?? null };
  if (ctx.json) {
    emitJson({ ok: true, ...identity });
  } else {
    const project = identity.projectId ? ` (project ${identity.projectId})` : "";
    process.stdout.write(`${successText} ${identity.email}${project}\n`);
  }
}

/** Register the `gmc auth` command group. */
export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authenticate against the Google Merchant API");

  auth
    .command("login")
    .description("Sign in with your Google account in the browser (OAuth)")
    .option("--no-browser", "Print the authorization URL instead of opening a browser")
    .action(async (opts: { browser?: boolean }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        if (!ctx.json) process.stderr.write("Opening your browser to authorize gmc…\n");
        const cred = await loginWithOAuth({
          configDir: getConfigDir(),
          profile: ctx.profile,
          openBrowser: opts.browser !== false,
          onAuthUrl: (url) => {
            process.stderr.write(`\nIf your browser did not open, visit:\n${url}\n\n`);
          },
        });
        if (ctx.json) {
          emitJson({ ok: true, email: cred.email, projectId: null });
        } else {
          process.stdout.write(`✓ Logged in as ${cred.email}\n`);
        }
      } catch (err) {
        reportError(err, { json }, "gmc auth login");
      }
    });

  auth
    .command("logout")
    .description("Remove the stored OAuth login for the current profile")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const configDir = getConfigDir();
        const stored = await loadStoredCredential(configDir, ctx.profile);
        const removed = await clearStoredCredential(configDir, ctx.profile);
        if (stored) await clearTokenCache(configDir, stored.email).catch(() => {});
        if (ctx.json) {
          emitJson({ ok: true, removed, profile: ctx.profile });
        } else if (removed) {
          const who = stored ? ` (${stored.email})` : "";
          process.stdout.write(`✓ Logged out${who} — profile "${ctx.profile}"\n`);
        } else {
          process.stdout.write(`No stored login for profile "${ctx.profile}".\n`);
        }
      } catch (err) {
        reportError(err, { json }, "gmc auth logout");
      }
    });

  auth
    .command("whoami")
    .description("Show the resolved credential identity (no network call)")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const client = await resolveAuth({ cachePath: getConfigDir(), profile: ctx.profile });
        printIdentity(client, ctx, "Authenticated as");
      } catch (err) {
        reportError(err, { json }, "gmc auth whoami");
      }
    });

  auth
    .command("test")
    .description("Verify credentials by requesting an access token")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const client = await resolveAuth({ cachePath: getConfigDir(), profile: ctx.profile });
        await client.getAccessToken();
        printIdentity(client, ctx, "✓ Credentials valid —");
      } catch (err) {
        reportError(err, { json }, "gmc auth test");
      }
    });
}
