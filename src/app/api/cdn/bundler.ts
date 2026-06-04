import { transform } from "esbuild";
import { createCacheKey, readCachedBundle, writeCachedBundle } from "./cache";
import { buildModuleBundle } from "./module-bundler";
import { removeJavaScriptComments } from "./comments";
import { createGlobalAlias } from "./globals";
import { buildCssPayload, createCssRuntime, resolveStyleId } from "./css";
import type { AssetFailure, BuiltBundle, RequestOptions, ResolvedAsset } from "./types";

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
 * Creates a structured failure for a JavaScript asset that failed after resolution.
 *
 * @param stage Failure stage.
 * @param asset Asset that failed.
 * @param error Unknown caught error.
 * @returns Structured asset failure.
 */
function createAssetFailure(stage: AssetFailure["stage"], asset: ResolvedAsset, error: unknown): AssetFailure {
  return {
    stage,
    sourceLabel: asset.sourceLabel,
    provider: asset.provider,
    packageName: asset.packageName,
    version: asset.version,
    file: asset.file,
    url: asset.url,
    message: error instanceof Error ? error.message : "Unknown JavaScript asset failure",
  };
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
  const alias = createGlobalAlias(options, asset);

  return [
    `;\n/* ${asset.provider}:${asset.sourceLabel} */`,
    cleaned,
    alias,
  ].join("\n");
}

/**
 * Determines if final minification is safe for the whole bundle.
 *
 * @remarks
 * esbuild minifies the final concatenated file. If any asset says
 * `minify:false`, the safest option is skipping final minification for the
 * whole bundle, because minifying only some chunks would change the order and
 * semantics of userscript-style globals.
 *
 * @param options Request options.
 * @param assets Resolved assets.
 * @returns Whether the final bundle should be minified.
 */
function shouldMinifyBundle(options: RequestOptions, assets: readonly ResolvedAsset[]): boolean {
  return options.minify && assets.every((asset) => asset.options.minify !== false);
}

/**
 * Builds and optionally minifies resolved assets into a single response body.
 *
 * @param options Request options.
 * @param assets Resolved JavaScript assets.
 * @param cssAssets Resolved CSS assets.
 * @param initialFailures Failures collected before the build phase.
 * @returns Built bundle with cache metadata.
 */
export async function buildBundle(
  options: RequestOptions,
  assets: readonly ResolvedAsset[],
  cssAssets: readonly ResolvedAsset[] = [],
  initialFailures: readonly AssetFailure[] = [],
): Promise<BuiltBundle> {
  if (options.bundleMode !== "raw") {
    return buildModuleBundle(options, assets, cssAssets, initialFailures);
  }

  const minify = shouldMinifyBundle(options, assets);
  const cssPayload = await buildCssPayload(cssAssets);
  const cssStyleId = resolveStyleId(options, cssPayload.css);
  const cacheKey = createCacheKey({ ...options, minify }, [...assets, ...cssAssets]);
  const cached = await readCachedBundle(cacheKey);
  const warnings = [...assets.flatMap((asset) => asset.warnings), ...cssPayload.warnings];
  const failures: AssetFailure[] = [...initialFailures, ...cssPayload.failures];

  if (cached !== null) {
    return {
      code: cached,
      assets,
      cssAssets,
      cssStyleId,
      warnings,
      failures,
      cacheKey,
      cacheHit: true,
    };
  }

  const chunks: string[] = [];

  for (const asset of assets) {
    try {
      const source = await downloadAsset(asset);
      chunks.push(prepareAssetSource(asset, source, options));
    } catch (error) {
      failures.push(createAssetFailure("download", asset, error));
    }
  }

  const cssRuntime = createCssRuntime(options, cssPayload.css, cssAssets);
  let code = [...chunks, cssRuntime].filter(Boolean).join("\n");

  if (!minify && options.minify) {
    warnings.push("Minification skipped because at least one asset requested minify:false.");
  }

  if (minify && code) {
    try {
      const result = await transform(code, {
        loader: "js",
        minify: true,
        legalComments: options.removeComments ? "none" : "inline",
        target: "es2018",
      });

      code = result.code;
    } catch (error) {
      warnings.push(`Minification skipped because esbuild could not parse one asset: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  await writeCachedBundle(cacheKey, code);

  return {
    code,
    assets,
    cssAssets,
    cssStyleId,
    warnings,
    failures,
    cacheKey,
    cacheHit: false,
  };
}
