import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { AuthError } from "./errors.js";
import { createServiceAccountAuth, loadServiceAccountKey } from "./service-account.js";
import { acquireToken } from "./token-cache.js";
import { DEFAULT_SCOPES } from "./scopes.js";
import { loadStoredCredential } from "./oauth-store.js";
import { createOAuthAuth } from "./oauth.js";
import type { AuthClient, AuthOptions } from "./types.js";

async function tryApplicationDefaultCredentials(options?: AuthOptions): Promise<AuthClient | null> {
  try {
    const auth = new GoogleAuth({
      scopes: options?.scopes ?? [...DEFAULT_SCOPES],
    });

    const client = await auth.getClient();
    const projectId = await auth.getProjectId().catch(() => undefined);
    const clientEmail = (client as { email?: string }).email;
    const email =
      clientEmail ??
      `adc-${createHash("sha256")
        .update(projectId ?? process.env["GOOGLE_APPLICATION_CREDENTIALS"] ?? "default")
        .digest("hex")
        .slice(0, 12)}`;

    return {
      async getAccessToken(): Promise<string> {
        return acquireToken(email, options?.cachePath, async () => {
          const { token } = await client.getAccessToken();
          if (!token) {
            throw new AuthError(
              "Application Default Credentials returned an empty token.",
              "AUTH_TOKEN_FAILED",
              "Verify your ADC configuration with: gcloud auth application-default print-access-token",
            );
          }
          return { token, expiresInSeconds: 3600 };
        });
      },

      getProjectId(): string | undefined {
        return projectId ?? undefined;
      },

      getClientEmail(): string {
        return email;
      },
    };
  } catch {
    return null;
  }
}

/**
 * Resolve an {@link AuthClient} from explicit options, environment variables, or
 * Application Default Credentials — in that precedence order.
 */
export async function resolveAuth(options?: AuthOptions): Promise<AuthClient> {
  const saOptions = { cachePath: options?.cachePath, scopes: options?.scopes };

  // 1. Explicit options
  if (options?.serviceAccountJson) {
    const key = await loadServiceAccountKey(options.serviceAccountJson);
    return createServiceAccountAuth(key, saOptions);
  }

  if (options?.serviceAccountPath) {
    const key = await loadServiceAccountKey(options.serviceAccountPath);
    return createServiceAccountAuth(key, saOptions);
  }

  // 2. GMC_SERVICE_ACCOUNT environment variable (file path or raw JSON)
  const envValue = process.env["GMC_SERVICE_ACCOUNT"];
  if (envValue) {
    const key = await loadServiceAccountKey(envValue);
    return createServiceAccountAuth(key, saOptions);
  }

  // 3. GOOGLE_APPLICATION_CREDENTIALS environment variable
  const gacPath = process.env["GOOGLE_APPLICATION_CREDENTIALS"];
  if (gacPath) {
    try {
      const key = await loadServiceAccountKey(gacPath);
      return createServiceAccountAuth(key, saOptions);
    } catch (err) {
      // A missing file falls through to ADC (which also reads this env var).
      // A present-but-invalid key is a real misconfiguration — surface it rather
      // than silently ignoring an explicitly-provided credential.
      if (!(err instanceof AuthError) || err.code !== "AUTH_FILE_NOT_FOUND") {
        throw err;
      }
    }
  }

  // 4. Stored OAuth login (from `gmc auth login`). A deliberate interactive
  // login wins over ambient ADC, but explicit service-account env vars above
  // still take precedence.
  if (options?.cachePath) {
    const stored = await loadStoredCredential(options.cachePath, options.profile);
    if (stored) {
      return createOAuthAuth(stored, { cachePath: options.cachePath });
    }
  }

  // 5. Application Default Credentials
  const adcClient = await tryApplicationDefaultCredentials(options);
  if (adcClient) {
    return adcClient;
  }

  throw new AuthError(
    "No credentials found. Could not authenticate with the Google Merchant API.",
    "AUTH_NO_CREDENTIALS",
    [
      "Provide credentials using one of these methods:",
      "  1. Run `gmc auth login` to sign in with your Google account (OAuth)",
      "  2. Pass serviceAccountPath or serviceAccountJson in options",
      "  3. Set the GMC_SERVICE_ACCOUNT environment variable to a file path or raw JSON",
      "  4. Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file",
      "  5. Configure Application Default Credentials: gcloud auth application-default login",
    ].join("\n"),
  );
}
