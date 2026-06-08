import type { Command } from "commander";
import {
  resolveAuth,
  loginWithOAuth,
  loadStoredCredential,
  clearStoredCredential,
  clearTokenCache,
  AuthError,
  DEFAULT_PROFILE,
} from "@gmc-cli/auth";
import type { AuthClient } from "@gmc-cli/auth";
import { getConfigDir } from "@gmc-cli/config";
import { createContext } from "@gmc-cli/core";
import type { CommandContext } from "@gmc-cli/core";

interface GlobalOpts {
  json?: unknown;
  profile?: unknown;
}

function contextFrom(program: Command): CommandContext {
  const opts = program.opts() as GlobalOpts;
  return createContext({
    json: Boolean(opts.json),
    profile: typeof opts.profile === "string" ? opts.profile : undefined,
  });
}

function printIdentity(client: AuthClient, ctx: CommandContext, successText: string): void {
  const identity = { email: client.getClientEmail(), projectId: client.getProjectId() ?? null };
  if (ctx.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, ...identity })}\n`);
  } else {
    const project = identity.projectId ? ` (project ${identity.projectId})` : "";
    process.stdout.write(`${successText} ${identity.email}${project}\n`);
  }
}

// Consistent `{ ok }` envelope for both success and error. In JSON mode, errors
// also go to stdout so machine consumers can parse a single stream.
function reportAuthError(err: unknown, json: boolean): void {
  if (err instanceof AuthError) {
    if (json) {
      const body = {
        ok: false,
        error: { code: err.code, message: err.message, suggestion: err.suggestion },
      };
      process.stdout.write(`${JSON.stringify(body)}\n`);
    } else {
      process.stderr.write(`${err.message}\n`);
      if (err.suggestion) process.stderr.write(`\n${err.suggestion}\n`);
    }
    process.exitCode = err.exitCode;
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
  } else {
    process.stderr.write(`gmc auth: ${message}\n`);
  }
  process.exitCode = 1;
}

/** Register the `gmc auth` command group. */
export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authenticate against the Google Merchant API");

  auth
    .command("login")
    .description("Sign in with your Google account in the browser (OAuth)")
    .option("--no-browser", "Print the authorization URL instead of opening a browser")
    .action(async (opts: { browser?: boolean }) => {
      const ctx = contextFrom(program);
      try {
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
          process.stdout.write(`${JSON.stringify({ ok: true, email: cred.email, projectId: null })}\n`);
        } else {
          process.stdout.write(`✓ Logged in as ${cred.email}\n`);
        }
      } catch (err) {
        reportAuthError(err, ctx.json);
      }
    });

  auth
    .command("logout")
    .description("Remove the stored OAuth login for the current profile")
    .action(async () => {
      const ctx = contextFrom(program);
      const profile = ctx.profile ?? DEFAULT_PROFILE;
      try {
        const configDir = getConfigDir();
        const stored = await loadStoredCredential(configDir, profile);
        const removed = await clearStoredCredential(configDir, profile);
        if (stored) await clearTokenCache(configDir, stored.email).catch(() => {});
        if (ctx.json) {
          process.stdout.write(`${JSON.stringify({ ok: true, removed, profile })}\n`);
        } else if (removed) {
          const who = stored ? ` (${stored.email})` : "";
          process.stdout.write(`✓ Logged out${who} — profile "${profile}"\n`);
        } else {
          process.stdout.write(`No stored login for profile "${profile}".\n`);
        }
      } catch (err) {
        reportAuthError(err, ctx.json);
      }
    });

  auth
    .command("whoami")
    .description("Show the resolved credential identity (no network call)")
    .action(async () => {
      const ctx = contextFrom(program);
      try {
        const client = await resolveAuth({ cachePath: getConfigDir(), profile: ctx.profile });
        printIdentity(client, ctx, "Authenticated as");
      } catch (err) {
        reportAuthError(err, ctx.json);
      }
    });

  auth
    .command("test")
    .description("Verify credentials by requesting an access token")
    .action(async () => {
      const ctx = contextFrom(program);
      try {
        const client = await resolveAuth({ cachePath: getConfigDir(), profile: ctx.profile });
        await client.getAccessToken();
        printIdentity(client, ctx, "✓ Credentials valid —");
      } catch (err) {
        reportAuthError(err, ctx.json);
      }
    });
}
