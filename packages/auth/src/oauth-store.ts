import { join, isAbsolute } from "node:path";
import { unlink } from "node:fs/promises";
import { AuthError } from "./errors.js";
import { readJsonFile, writeJsonFileSecure } from "./secure-file.js";

const STORE_FILE = "oauth-credentials.json";

/** Profile key used when the caller does not select a named profile. */
export const DEFAULT_PROFILE = "default";

/**
 * A user OAuth credential persisted by `gmc auth login`. The refresh token and
 * client secret are sensitive; the store is written `0600` (see
 * {@link writeJsonFileSecure}).
 */
export interface StoredOAuthCredential {
  /** OAuth client id used to obtain — and to refresh — this credential. */
  clientId: string;
  /** OAuth client secret paired with {@link clientId}. */
  clientSecret: string;
  /** Long-lived refresh token exchanged for access tokens. */
  refreshToken: string;
  /** Authenticated user's email (for `whoami`), or a placeholder if unknown. */
  email: string;
  /** Scopes granted at login time. */
  scopes: string[];
  /** Unix epoch milliseconds when the credential was stored. */
  createdAt: number;
}

type Store = Record<string, StoredOAuthCredential>;

function storePath(configDir: string): string {
  if (!isAbsolute(configDir)) {
    throw new AuthError(
      "Config directory must be an absolute path.",
      "AUTH_CACHE_INVALID",
      "Provide an absolute path for the gmc config directory (e.g., /home/user/.config/gmc).",
    );
  }
  return join(configDir, STORE_FILE);
}

/** Load the stored OAuth credential for a profile, or `null` if none exists. */
export async function loadStoredCredential(
  configDir: string,
  profile: string = DEFAULT_PROFILE,
): Promise<StoredOAuthCredential | null> {
  const store = await readJsonFile<Store>(storePath(configDir));
  return store?.[profile] ?? null;
}

/** Persist (or replace) the OAuth credential for a profile. */
export async function saveStoredCredential(
  configDir: string,
  profile: string,
  credential: StoredOAuthCredential,
): Promise<void> {
  const path = storePath(configDir);
  const store = (await readJsonFile<Store>(path)) ?? {};
  store[profile] = credential;
  await writeJsonFileSecure(path, store);
}

/**
 * Remove the stored credential for a profile (or all profiles when `profile` is
 * omitted). Returns `true` if anything was removed.
 */
export async function clearStoredCredential(configDir: string, profile?: string): Promise<boolean> {
  const path = storePath(configDir);

  if (profile === undefined) {
    const existed = (await readJsonFile<Store>(path)) !== null;
    await unlink(path).catch(() => {});
    return existed;
  }

  const store = await readJsonFile<Store>(path);
  if (!store || !(profile in store)) {
    return false;
  }
  const next = Object.fromEntries(Object.entries(store).filter(([key]) => key !== profile));
  await writeJsonFileSecure(path, next);
  return true;
}
