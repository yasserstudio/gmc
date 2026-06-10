import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OAuth2Client } from "google-auth-library";
import { AuthError, safeErrorMessage } from "./errors.js";
import { acquireToken } from "./token-cache.js";
import { scopesFor, type SubApi } from "./scopes.js";
import {
  DEFAULT_PROFILE,
  saveStoredCredential,
  type StoredOAuthCredential,
} from "./oauth-store.js";
import type { AuthClient } from "./types.js";

/** OAuth client id/secret pair used to drive the installed-app login flow. */
export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

// Identity scopes requested alongside the API scopes so `whoami` can show the
// signed-in user's email. They are Google's non-sensitive default scopes.
const IDENTITY_SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email"];

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes to complete browser consent

const CLIENT_MISSING_HELP = [
  "Provide an OAuth client for the browser login flow using one of:",
  "  1. Set GMC_OAUTH_CLIENT_ID and GMC_OAUTH_CLIENT_SECRET",
  "  2. Set GMC_OAUTH_CLIENT_SECRETS to a downloaded client_secret.json (Desktop app type)",
  "  3. Place client_secret.json in your gmc config directory",
  "",
  "Create a Desktop OAuth client in the Google Cloud Console and enable the",
  "https://www.googleapis.com/auth/content scope on the OAuth consent screen.",
].join("\n");

/** Parse a Google-issued `client_secret.json` (Desktop "installed" or "web" shape). */
export function parseClientSecretsJson(raw: string): OAuthClientConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AuthError(
      "Failed to parse client_secret.json as JSON.",
      "AUTH_OAUTH_CLIENT_MISSING",
      "Re-download the OAuth client JSON from the Google Cloud Console.",
    );
  }

  const root = parsed as Record<string, unknown>;
  const node = (root["installed"] ?? root["web"] ?? root) as Record<string, unknown>;
  const clientId = node["client_id"];
  const clientSecret = node["client_secret"];

  if (
    typeof clientId !== "string" ||
    typeof clientSecret !== "string" ||
    !clientId ||
    !clientSecret
  ) {
    throw new AuthError(
      "client_secret.json is missing client_id or client_secret.",
      "AUTH_OAUTH_CLIENT_MISSING",
      "Use a Desktop-app OAuth client JSON downloaded from the Google Cloud Console.",
    );
  }
  return { clientId, clientSecret };
}

async function readClientSecretsFile(
  path: string,
  required: boolean,
): Promise<OAuthClientConfig | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const missing = err instanceof Error && "code" in err && err.code === "ENOENT";
    // An explicitly-pointed-at file that is missing is a real misconfiguration;
    // a missing default-location file just falls through to the next source.
    if (missing && !required) return null;
    throw new AuthError(
      `Failed to read OAuth client secrets file: ${path}`,
      "AUTH_OAUTH_CLIENT_MISSING",
      missing ? "Check that the path is correct." : "Ensure the file is readable.",
    );
  }
  return parseClientSecretsJson(raw);
}

/**
 * Resolve a bring-your-own OAuth client from, in order: the
 * `GMC_OAUTH_CLIENT_ID`/`GMC_OAUTH_CLIENT_SECRET` env vars, a
 * `GMC_OAUTH_CLIENT_SECRETS` file path, or `client_secret.json` in `configDir`.
 */
export async function loadOAuthClientConfig(configDir?: string): Promise<OAuthClientConfig> {
  const id = process.env["GMC_OAUTH_CLIENT_ID"];
  const secret = process.env["GMC_OAUTH_CLIENT_SECRET"];
  if (id && secret) return { clientId: id, clientSecret: secret };
  if (id && !secret) {
    throw new AuthError(
      "GMC_OAUTH_CLIENT_ID is set but GMC_OAUTH_CLIENT_SECRET is not.",
      "AUTH_OAUTH_CLIENT_MISSING",
      "Set both variables, or use a client_secret.json file instead.",
    );
  }

  const explicitPath = process.env["GMC_OAUTH_CLIENT_SECRETS"];
  if (explicitPath) {
    const fromFile = await readClientSecretsFile(explicitPath, true);
    if (fromFile) return fromFile;
  }

  if (configDir) {
    const fromDefault = await readClientSecretsFile(join(configDir, "client_secret.json"), false);
    if (fromDefault) return fromDefault;
  }

  throw new AuthError(
    "No OAuth client credentials found.",
    "AUTH_OAUTH_CLIENT_MISSING",
    CLIENT_MISSING_HELP,
  );
}

const SUCCESS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>gmc</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding-top:4rem">
<h1>✓ Authorized</h1><p>You can close this tab and return to the terminal.</p></body></html>`;

function openBrowserUrl(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // browser launch is best-effort; the URL is also printed
    child.unref();
  } catch {
    // ignore — the caller prints the URL as a manual fallback
  }
}

/** Best-effort decode of the signed-in email from an unverified id_token. */
function decodeIdTokenEmail(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return undefined;
    const json = Buffer.from(payload, "base64url").toString("utf-8");
    const email = (JSON.parse(json) as { email?: unknown }).email;
    return typeof email === "string" && email ? email : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the identity used for display and for keying the access-token cache.
 * Prefers the email from the id_token (delivered over TLS in the same token
 * response, used display-only — never for authorization). When the email claim
 * is absent (identity scope not granted), derive a stable per-credential id from
 * the refresh token so two unknown-email logins never collide on one cache key.
 */
export function deriveOAuthIdentity(idToken: string | undefined, refreshToken: string): string {
  const email = decodeIdTokenEmail(idToken);
  if (email) return email;
  return `oauth-${createHash("sha256").update(refreshToken).digest("hex").slice(0, 12)}`;
}

interface LoopbackResult {
  refreshToken: string;
  idToken: string | undefined;
  grantedScopes: string[] | undefined;
}

interface LoopbackOptions {
  config: OAuthClientConfig;
  scopes: string[];
  openBrowser: boolean;
  timeoutMs: number;
  onAuthUrl: (url: string) => void;
}

// Run the OAuth installed-app loopback flow: bind a localhost server on an
// ephemeral port, send the user to Google's consent screen, and capture the
// authorization code on the redirect back.
function runLoopbackFlow(opts: LoopbackOptions): Promise<LoopbackResult> {
  const { config, scopes, openBrowser, timeoutMs, onAuthUrl } = opts;
  const state = randomBytes(16).toString("hex");

  return new Promise<LoopbackResult>((resolve, reject) => {
    let settled = false;
    let client: OAuth2Client | undefined;
    let redirectUri = "";

    function finish(action: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      action();
    }

    const server = createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url ?? "/", redirectUri || "http://127.0.0.1");
        const params = reqUrl.searchParams;
        const error = params.get("error");
        const code = params.get("code");
        const returnedState = params.get("state");

        // Ignore unrelated requests (e.g. favicon) without tearing down the server.
        if (!error && !code) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        if (returnedState !== state) {
          res.statusCode = 400;
          res.end("State mismatch.");
          finish(() =>
            reject(
              new AuthError(
                "OAuth state mismatch — aborting for safety.",
                "AUTH_OAUTH_FAILED",
                "Run `gmc auth login` again.",
              ),
            ),
          );
          return;
        }

        if (error) {
          res.statusCode = 400;
          res.end("Authorization denied. You can close this tab.");
          finish(() =>
            reject(
              new AuthError(
                `Authorization was denied: ${error}.`,
                "AUTH_OAUTH_DENIED",
                "Grant access when prompted, and ensure the content scope is on the OAuth consent screen.",
              ),
            ),
          );
          return;
        }

        if (!client || !code) {
          res.statusCode = 500;
          res.end("Internal error.");
          finish(() =>
            reject(
              new AuthError(
                "OAuth flow was not ready to exchange the authorization code.",
                "AUTH_OAUTH_FAILED",
                "Run `gmc auth login` again.",
              ),
            ),
          );
          return;
        }

        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(SUCCESS_HTML);

        client
          .getToken(code)
          .then(({ tokens }) => {
            const refreshToken = tokens.refresh_token;
            if (!refreshToken) {
              finish(() =>
                reject(
                  new AuthError(
                    "Google did not return a refresh token.",
                    "AUTH_OAUTH_NO_REFRESH_TOKEN",
                    "Revoke prior access at https://myaccount.google.com/permissions, then run `gmc auth login` again to force a fresh consent.",
                  ),
                ),
              );
              return;
            }
            const grantedScopes =
              typeof tokens.scope === "string" ? tokens.scope.split(" ") : undefined;
            finish(() =>
              resolve({
                refreshToken,
                idToken: tokens.id_token ?? undefined,
                grantedScopes,
              }),
            );
          })
          .catch((err: unknown) => finish(() => reject(wrapExchangeError(err))));
      } catch (err) {
        finish(() => reject(wrapExchangeError(err)));
      }
    });

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new AuthError(
            "Timed out waiting for browser authorization.",
            "AUTH_OAUTH_TIMEOUT",
            "Run `gmc auth login` again and complete the consent prompt in your browser.",
          ),
        ),
      );
    }, timeoutMs);

    server.on("error", (err) => finish(() => reject(wrapExchangeError(err))));

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      redirectUri = `http://127.0.0.1:${port}`;
      client = new OAuth2Client({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri,
      });
      const authUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: scopes,
        state,
      });
      onAuthUrl(authUrl);
      if (openBrowser) openBrowserUrl(authUrl);
    });
  });
}

function wrapExchangeError(err: unknown): AuthError {
  if (err instanceof AuthError) return err;
  return new AuthError(
    `OAuth authorization failed: ${safeErrorMessage(err)}`,
    "AUTH_OAUTH_FAILED",
    "Run `gmc auth login` again. If it persists, check the OAuth client and consent-screen configuration.",
  );
}

/** Options for {@link loginWithOAuth}. */
export interface LoginOptions {
  /** gmc config directory — where credentials are stored and a default client is read. */
  configDir: string;
  /** Profile to store the credential under. Defaults to "default". */
  profile?: string;
  /** Sub-APIs whose scopes to request. Defaults to the full Merchant API scope. */
  subApis?: SubApi | readonly SubApi[];
  /** Open the system browser automatically. Defaults to true. */
  openBrowser?: boolean;
  /** Overall timeout for the consent flow, in milliseconds. */
  timeoutMs?: number;
  /** Called with the consent URL (for printing a manual fallback). */
  onAuthUrl?: (url: string) => void;
}

/**
 * Run the interactive OAuth login flow and persist the resulting credential.
 * Returns the stored credential (including the resolved user email).
 */
export async function loginWithOAuth(options: LoginOptions): Promise<StoredOAuthCredential> {
  const config = await loadOAuthClientConfig(options.configDir);
  const apiScopes = scopesFor(options.subApis);
  const scopes = [...new Set([...apiScopes, ...IDENTITY_SCOPES])];

  const result = await runLoopbackFlow({
    config,
    scopes,
    openBrowser: options.openBrowser ?? true,
    timeoutMs: options.timeoutMs ?? LOGIN_TIMEOUT_MS,
    onAuthUrl: options.onAuthUrl ?? (() => {}),
  });

  const credential: StoredOAuthCredential = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: result.refreshToken,
    email: deriveOAuthIdentity(result.idToken, result.refreshToken),
    scopes: result.grantedScopes ?? apiScopes,
    createdAt: Date.now(),
  };

  await saveStoredCredential(options.configDir, options.profile ?? DEFAULT_PROFILE, credential);
  return credential;
}

/** Options for {@link createOAuthAuth}. */
export interface OAuthAuthOptions {
  /** Absolute directory for the on-disk access-token cache. Omit to skip caching. */
  cachePath?: string;
}

/**
 * Build an {@link AuthClient} from a stored OAuth credential. Access tokens are
 * minted from the refresh token (google-auth-library handles the refresh) and
 * cached per user email.
 */
export function createOAuthAuth(
  stored: StoredOAuthCredential,
  options: OAuthAuthOptions = {},
): AuthClient {
  const client = new OAuth2Client({
    clientId: stored.clientId,
    clientSecret: stored.clientSecret,
  });
  client.setCredentials({ refresh_token: stored.refreshToken });

  return {
    async getAccessToken(): Promise<string> {
      try {
        return await acquireToken(stored.email, options.cachePath, async () => {
          const { token } = await client.getAccessToken();
          if (!token) {
            throw new AuthError(
              "OAuth token refresh returned an empty token.",
              "AUTH_OAUTH_FAILED",
              "Run `gmc auth login` to re-authenticate.",
            );
          }
          const expiry = client.credentials.expiry_date;
          const expiresInSeconds =
            typeof expiry === "number"
              ? Math.max(60, Math.floor((expiry - Date.now()) / 1000))
              : 3600;
          return { token, expiresInSeconds };
        });
      } catch (err) {
        if (err instanceof AuthError) throw err;
        throw new AuthError(
          `Failed to refresh OAuth access token: ${safeErrorMessage(err)}`,
          "AUTH_OAUTH_FAILED",
          "Your login may have expired or been revoked. Run `gmc auth login` to re-authenticate.",
        );
      }
    },

    getProjectId(): string | undefined {
      // User OAuth credentials are not bound to a GCP project.
      return undefined;
    },

    getClientEmail(): string {
      return stored.email;
    },
  };
}
