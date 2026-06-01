import { transform } from "esbuild";
import { createCacheKey, readCachedBundle, writeCachedBundle } from "./cache";
import { removeJavaScriptComments } from "./comments";
import { createGlobalAlias, wrapInIife } from "./globals";
import type { BuiltBundle, RequestOptions, ResolvedAsset } from "./types";

/**
 * Downloads one resolved asset.
 *
 * @param asset Concrete asset URL and metadata.
 * @returns JavaScript source.
 */
async function downloadAsset(asset: ResolvedAsset): Promise<string> {
  const response = await fetch(asset.url, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`Failed to download ${asset.sourceLabel}: ${response.status}`);
  }

  return response.text();
}

/**
 * Applies per-asset cleanup, labels and global alias helpers.
 *
 * @param asset Resolved asset.
 * @param source Downloaded source.
 * @param options Request-level options.
 * @returns Processed asset source.
 */
function prepareAssetSource(asset: ResolvedAsset, source: string, options: RequestOptions): string {
  const shouldRemoveComments = asset.options.removeComments ?? options.removeComments;
  const cleaned = shouldRemoveComments ? removeJavaScriptComments(source) : source;
  const alias = createGlobalAlias(asset);

  return [
    `;\n/* ${asset.provider}:${asset.sourceLabel} */`,
    cleaned,
    alias,
  ].join("\n");
}

/**
 * Builds and optionally minifies resolved assets into a single response body.
 *
 * @param options Request options.
 * @param assets Resolved assets.
 * @returns Built bundle with cache metadata.
 */
export async function buildBundle(options: RequestOptions, assets: readonly ResolvedAsset[]): Promise<BuiltBundle> {
  const cacheKey = createCacheKey(options, assets);
  const cached = await readCachedBundle(cacheKey);
  const warnings = assets.flatMap((asset) => asset.warnings);

  if (cached !== null) {
    return {
      code: cached,
      assets,
      warnings,
      cacheKey,
      cacheHit: true,
    };
  }

  const chunks: string[] = [];

  for (const asset of assets) {
    const source = await downloadAsset(asset);
    chunks.push(prepareAssetSource(asset, source, options));
  }

  let code = chunks.join("\n");

  if (options.bundleMode === "iife") {
    code = wrapInIife(code);
  }

  if (options.minify) {
    const result = await transform(code, {
      loader: "js",
      minify: true,
      legalComments: options.removeComments ? "none" : "inline",
      target: "es2018",
    });

    code = result.code;
  }

  await writeCachedBundle(cacheKey, code);

  return {
    code,
    assets,
    warnings,
    cacheKey,
    cacheHit: false,
  };
}
