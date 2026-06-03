import type { BuiltBundle, RequestOptions } from "./types";

/***************************************************************************************************
 * Banner Helpers
 **************************************************************************************************/

/**
 * Formats a boolean value for the generated bundle banner.
 *
 * @param value Boolean value.
 * @returns Human-readable yes/no string.
 */
function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

/**
 * Creates a highlighted JavaScript comment with request and asset metadata.
 *
 * @remarks
 * This banner is attached at response time instead of being stored in the disk cache, so `cacheHit`
 * always reflects the current request accurately.
 *
 * @param options Request options.
 * @param bundle Built bundle.
 * @returns Banner comment.
 *
 * @example
 * ```ts
 * createMetadataBanner(options, bundle);
 * // /*! Rod CDN Bundle ... *\/
 * ```
 */
export function createMetadataBanner(options: RequestOptions, bundle: BuiltBundle): string {
  const styleId = bundle.cssStyleId;
  const lines = [
    "/*!",
    " * ============================================================================",
    " * Rod CDN Bundle",
    " * ============================================================================",
    ` * Generated: ${new Date().toISOString()}`,
    ` * Global namespace: ${options.globalName ?? "disabled"}`,
    ` * Bundle mode: ${options.bundleMode}`,
    ` * Output format: ${options.format}`,
    ` * JS minified: ${yesNo(options.minify)}`,
    " * CSS minified: yes",
    ` * CSS inject: ${yesNo(options.cssInject)}`,
    ` * CSS target: ${options.cssTarget}`,
    ` * CSS style id: ${styleId ?? "none"}`,
    ` * Cache mode: ${options.cacheMode}`,
    ` * Cache hit: ${yesNo(bundle.cacheHit)}`,
    ` * Cache key: ${bundle.cacheKey}`,
    " *",
    " * JavaScript assets:",
    ...(bundle.assets.length > 0
      ? bundle.assets.map((asset) => ` * - ${asset.sourceLabel} via ${asset.provider}`)
      : [" * - none"]),
    " *",
    " * CSS assets:",
    ...(bundle.cssAssets.length > 0
      ? bundle.cssAssets.map((asset) => ` * - ${asset.sourceLabel} via ${asset.provider}`)
      : [" * - none"]),
    " * ============================================================================",
    " */",
  ];

  return lines.join("\n");
}

/**
 * Attaches the metadata banner when enabled.
 *
 * @param options Request options.
 * @param bundle Built bundle.
 * @returns Bundle code with or without a banner.
 */
export function attachMetadataBanner(options: RequestOptions, bundle: BuiltBundle): string {
  if (!options.metadata) {
    return bundle.code;
  }

  return `${createMetadataBanner(options, bundle)}\n${bundle.code}`;
}
