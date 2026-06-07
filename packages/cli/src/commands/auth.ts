import type { Command } from "commander";
import { resolveAuth, AuthError } from "@gmc-cli/auth";
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
    .command("whoami")
    .description("Show the resolved credential identity (no network call)")
    .action(async () => {
      const ctx = contextFrom(program);
      try {
        const client = await resolveAuth({ cachePath: getConfigDir() });
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
        const client = await resolveAuth({ cachePath: getConfigDir() });
        await client.getAccessToken();
        printIdentity(client, ctx, "✓ Credentials valid —");
      } catch (err) {
        reportAuthError(err, ctx.json);
      }
    });
}
