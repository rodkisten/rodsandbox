import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, CACHE_SECONDS } from "./constants";
import type { CacheMode, RequestOptions, ResolvedAsset } from "./types";

/**
 * Creates a stable content cache key for the resolved bundle request.
 *
 * @param options Parsed request options.
 * @param assets Resolved assets.
 * @returns SHA-256 cache key.
 */
export function createCacheKey(options: RequestOptions, assets: readonly ResolvedAsset[]): string {
  return crypto
    .createHash("sha256")
    .update(
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
      }),
    )
    .digest("hex");
}

/**
 * Reads a cached bundle if it exists.
 *
 * @param cacheKey Stable cache key.
 * @returns Cached code or null.
 */
export async function readCachedBundle(cacheKey: string): Promise<string | null> {
  try {
    return await readFile(path.join(CACHE_DIR, `${cacheKey}.js`), "utf8");
  } catch {
    return null;
  }
}

/**
 * Persists a generated bundle on disk.
 *
 * @param cacheKey Stable cache key.
 * @param code Generated code.
 */
export async function writeCachedBundle(cacheKey: string, code: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, `${cacheKey}.js`), code, "utf8");
}

/**
 * Creates browser and CDN cache headers.
 *
 * @param cacheMode Cache alias.
 * @returns HTTP cache headers.
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
