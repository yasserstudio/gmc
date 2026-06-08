import { chmod, mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Read and JSON-parse a file, returning `null` if it is missing or unparseable.
 * Credential stores are best-effort on read: a corrupt file should degrade to
 * "no stored credential" rather than crash the CLI.
 */
export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Atomically write JSON to `path` with owner-only permissions. The parent
 * directory is created `0700` (only when newly created) and the file written
 * `0600`, then renamed into place so readers never observe a partial file.
 */
export async function writeJsonFileSecure(path: string, data: unknown): Promise<void> {
  const parent = dirname(path);
  // mkdir returns the first directory created, or undefined if it already
  // existed — only tighten permissions on a directory we just created.
  const created = await mkdir(parent, { recursive: true });
  if (created) {
    await chmod(parent, 0o700).catch(() => {});
  }
  // Randomized temp name so concurrent writers don't clobber a shared `.tmp`.
  const tmpPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", {
      encoding: "utf-8",
      mode: 0o600,
    });
    // Pin 0600 independent of umask before the secret-bearing file is exposed.
    await chmod(tmpPath, 0o600).catch(() => {});
    await rename(tmpPath, path);
  } catch (err) {
    // Never leave a plaintext-secret temp file behind on a failed write/rename.
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}
