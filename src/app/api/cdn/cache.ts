import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CACHE_DIR, CACHE_SECONDS } from "./constants";
import type { CacheMode, RequestOptions, ResolvedAsset } from "./types";

/***************************************************************************************************
 * Constants
 **************************************************************************************************/

const CACHE_FILE_EXTENSION = ".js";
const CACHE_KEY_ALGORITHM = "sha256";
const CACHE_KEY_ENCODING = "hex";
const CACHE_KEY_SAFE_PATTERN = /^[a-f0-9]{64}$/i;
const CACHE_DIR_ENV_NAME = "CDN_CACHE_DIR";
const VERCEL_ENV_NAME = "VERCEL";
const SERVERLESS_CACHE_DIR_NAME = "cdn-runtime-cache";

/***************************************************************************************************
 * Cache Key Helpers
 **************************************************************************************************/

/**
 * Creates a SHA-256 hash from a string payload.
 *
 * @param value Value to hash.
 * @returns Stable SHA-256 hex digest.
 *
 * @example
 * ```ts
 * createSha256Hash("hello");
 * // "2cf24dba5fb0a30e26e83b2ac5b9e29e..."
 * ```
 */
function createSha256Hash(value: string): string {
  return crypto.createHash(CACHE_KEY_ALGORITHM).update(value).digest(CACHE_KEY_ENCODING);
}

/**
 * Normalizes external cache keys before using them as file names.
 *
 * @remarks
 * `createCacheKey` already returns a safe SHA-256 key, but this helper keeps the
 * file-system boundary defensive in case a future caller passes a custom key.
 *
 * @param cacheKey Candidate cache key.
 * @returns Safe cache file key.
 *
 * @example
 * ```ts
 * normalizeCacheKey("abc");
 * // A SHA-256 hash of "abc".
 * ```
 */
function normalizeCacheKey(cacheKey: string): string {
  if (CACHE_KEY_SAFE_PATTERN.test(cacheKey)) {
    return cacheKey;
  }

  return createSha256Hash(cacheKey);
}

/***************************************************************************************************
 * Runtime Directory Helpers
 **************************************************************************************************/

/**
 * Resolves a writable cache directory for the current runtime.
 *
 * @remarks
 * Vercel serverless functions should not write inside `.next/cache` at runtime.
 * `/tmp` is the safe writable area there. Locally, this still uses the existing
 * `CACHE_DIR` constant unless `CDN_CACHE_DIR` is explicitly provided.
 *
 * @returns Writable cache directory path.
 *
 * @example
 * ```ts
 * resolveWritableCacheDir();
 * // "/tmp/cdn-runtime-cache" on Vercel.
 * ```
 */
function resolveWritableCacheDir(): string {
  const configuredCacheDir = process.env[CACHE_DIR_ENV_NAME]?.trim();

  if (configuredCacheDir) {
    return configuredCacheDir;
  }

  if (process.env[VERCEL_ENV_NAME]) {
    return path.join(os.tmpdir(), SERVERLESS_CACHE_DIR_NAME);
  }

  return CACHE_DIR;
}

/**
 * Builds the full cache file path for a cache key.
 *
 * @param cacheKey Stable cache key.
 * @returns Absolute cache file path.
 *
 * @example
 * ```ts
 * buildCacheFilePath("a".repeat(64));
 * // "/tmp/cdn-runtime-cache/aaaa....js" on Vercel.
 * ```
 */
function buildCacheFilePath(cacheKey: string): string {
  const safeCacheKey = normalizeCacheKey(cacheKey);

  return path.join(resolveWritableCacheDir(), `${safeCacheKey}${CACHE_FILE_EXTENSION}`);
}

/***************************************************************************************************
 * Public Cache API
 **************************************************************************************************/

/**
 * Creates a stable content cache key for the resolved bundle request.
 *
 * @param options Parsed request options.
 * @param assets Resolved assets.
 * @returns SHA-256 cache key.
 *
 * @example
 * ```ts
 * const cacheKey = createCacheKey(options, assets);
 *
 * console.log(cacheKey.length);
 * // 64
 * ```
 */
export function createCacheKey(options: RequestOptions, assets: ResolvedAsset[]): string {
  return createSha256Hash(
    JSON.stringify({
      assets: assets.map((asset) => ({
        provider: asset.provider,
        packageName: asset.packageName,
        version: asset.version,
        file: asset.file,
        url: asset.url,
        options: asset.options,
      })),
      minify: options.minify,
      removeComments: options.removeComments,
      bundleMode: options.bundleMode,
      globalName: options.globalName,
      cssInject: options.cssInject,
      cssTarget: options.cssTarget,
      cssId: options.cssId,
    }),
  );
}

/**
 * Reads a cached bundle if it exists.
 *
 * @remarks
 * Cache reads are intentionally best-effort. A missing file, unavailable runtime
 * directory, or temporary serverless storage issue should never break the CDN
 * response path.
 *
 * @param cacheKey Stable cache key.
 * @returns Cached code or null.
 *
 * @example
 * ```ts
 * const cached = await readCachedBundle(cacheKey);
 *
 * if (cached) {
 *   return cached;
 * }
 * ```
 */
export async function readCachedBundle(cacheKey: string): Promise<string | null> {
  try {
    return await readFile(buildCacheFilePath(cacheKey), "utf8");
  } catch {
    return null;
  }
}

/**
 * Persists a generated bundle on disk.
 *
 * @remarks
 * Disk cache writes are best-effort by design. This prevents production runtime
 * errors like `mkdir '/var/task/.next/cache'` from taking down the request.
 *
 * @param cacheKey Stable cache key.
 * @param code Generated code.
 * @returns Nothing.
 *
 * @example
 * ```ts
 * await writeCachedBundle(cacheKey, generatedCode);
 * ```
 */
export async function writeCachedBundle(cacheKey: string, code: string): Promise<void> {
  try {
    const cacheFilePath = buildCacheFilePath(cacheKey);
    const cacheDirectory = path.dirname(cacheFilePath);

    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cacheFilePath, code, "utf8");
  } catch {
    // Cache must never be a production failure point. The request can still return generated code.
  }
}

/**
 * Creates browser and CDN cache headers.
 *
 * @param cacheMode Cache alias.
 * @returns HTTP cache headers.
 *
 * @example
 * ```ts
 * createCacheHeaders("immutable");
 * // {
 * //   "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
 * //   ...
 * // }
 * ```
 */
export function createCacheHeaders(cacheMode: CacheMode): Record<string, string> {
  const seconds = CACHE_SECONDS[cacheMode];

  if (seconds === 0) {
    return {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    };
  }

  const immutable = cacheMode === "immutable" ? ", immutable" : "";

  return {
    "Cache-Control": `public, max-age=${seconds}, s-maxage=${seconds}${immutable}`,
    "CDN-Cache-Control": `public, max-age=${seconds}`,
    "Vercel-CDN-Cache-Control": `public, max-age=${seconds}`,
  };
}
