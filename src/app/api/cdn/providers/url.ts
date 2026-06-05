import type { ParsedAssetSpec, ResolvedAsset } from "../types";

/**
 * Resolves a direct URL into a download-ready asset.
 *
 * @remarks
 * This provider is intentionally small: validation happens in the parser, while this resolver keeps
 * a stable label and filename for cache keys and metadata banners.
 *
 * @param spec Parsed URL spec.
 * @returns Resolved direct URL asset.
 *
 * @example
 * ```ts
 * const asset = await resolveUrl({
 *   raw: "https://example.com/file.js",
 *   provider: "url",
 *   packageName: "https://example.com/file.js",
 *   version: "latest",
 *   file: null,
 *   options: {},
 * });
 *
 * console.log(asset.url);
 * // "https://example.com/file.js"
 * ```
 */
export async function resolveUrl(spec: ParsedAssetSpec): Promise<ResolvedAsset> {
  const url = new URL(spec.packageName);
  const file = url.pathname.split("/").filter(Boolean).pop() ?? "index.js";

  return {
    provider: "url",
    packageName: url.hostname,
    version: spec.version ?? "latest",
    file,
    url: url.toString(),
    sourceLabel: `url:${url.toString()}`,
    options: spec.options,
    warnings: [],
  };
}
