import { resolveNamespaceProperty } from "./globals";
import type { AssetFailure, BuiltBundle, RequestOptions, ResolvedAsset } from "./types";

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
 * Formats one successful asset line for the generated bundle banner.
 *
 * @param asset Successful asset metadata.
 * @returns Banner line.
 */
function formatSuccessfulAssetLine(asset: ResolvedAsset): string {
  const property = resolveNamespaceProperty(asset);

  return ` * - ${asset.sourceLabel} via ${asset.provider}; namespace key: ${property}; url: ${asset.url}`;
}

/**
 * Formats one failed asset line for the generated bundle banner.
 *
 * @param failure Failed asset metadata.
 * @returns Banner line.
 */
function formatFailedAssetLine(failure: AssetFailure): string {
  const provider = failure.provider ? ` via ${failure.provider}` : "";
  const url = failure.url ? `; url: ${failure.url}` : "";

  return ` * - [${failure.stage}] ${failure.sourceLabel}${provider}; reason: ${failure.message}${url}`;
}

/**
 * Creates JavaScript source that logs a compact loaded summary in the browser console.
 *
 * @param options Request options.
 * @param bundle Built bundle.
 * @returns Runtime console log source.
 */
function createLoadedConsoleRuntime(options: RequestOptions, bundle: BuiltBundle): string {
  if (options.format === "json") {
    return "";
  }

  const globalName = options.globalName ?? "RodCDN";
  const expectedGlobals = bundle.assets.map(resolveNamespaceProperty);
  const cssIds = bundle.cssStyleId ? [bundle.cssStyleId] : [];
  const failedLabels = bundle.failures.map((failure) => `[${failure.stage}] ${failure.sourceLabel}: ${failure.message}`);

  return [
    ";",
    "(function rodCdnLoadedConsole(globalThis) {",
    "  try {",
    `    var rootName = ${JSON.stringify(globalName)};`,
    `    var expectedGlobals = ${JSON.stringify(expectedGlobals)};`,
    `    var cssIds = ${JSON.stringify(cssIds)};`,
    `    var failures = ${JSON.stringify(failedLabels)};`,
    "    var root = globalThis[rootName] || {};",
    "    var availableGlobals = Object.keys(root).filter(function (key) { return key !== 'css'; }).sort();",
    "    var badge = 'background:#fb923c;color:#111827;border-radius:999px;padding:2px 8px;font-weight:800';",
    "    var title = 'color:#f97316;font-weight:900';",
    "    var soft = 'color:#9ca3af';",
    "    console.groupCollapsed('%c RodCDN %c loaded', badge, title);",
    "    console.log('%cNamespace', soft, rootName);",
    "    console.log('%cExpected globals', soft, expectedGlobals.length ? expectedGlobals : '(none)');",
    "    console.log('%cAvailable globals', soft, availableGlobals.length ? availableGlobals : '(none)');",
    "    console.log('%cCSS styles', soft, cssIds.length ? cssIds : '(none)');",
    "    if (failures.length) console.warn('RodCDN loaded partially. Failed assets:', failures);",
    "    console.groupEnd();",
    "  } catch (error) {",
    "    try { console.warn('RodCDN loaded, but the summary logger failed:', error); } catch (_) {}",
    "  }",
    "})(globalThis);",
  ].join("\n");
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
    " * JavaScript assets loaded successfully:",
    ...(bundle.assets.length > 0 ? bundle.assets.map(formatSuccessfulAssetLine) : [" * - none"]),
    " *",
    " * CSS assets loaded successfully:",
    ...(bundle.cssAssets.length > 0 ? bundle.cssAssets.map(formatSuccessfulAssetLine) : [" * - none"]),
    " *",
    " * Warnings:",
    ...(bundle.warnings.length > 0 ? bundle.warnings.map((warning) => ` * - ${warning}`) : [" * - none"]),
    " *",
    " * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    " * FAILED ASSETS / PARTIAL LOAD REPORT",
    " * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    ...(bundle.failures.length > 0 ? bundle.failures.map(formatFailedAssetLine) : [" * - none"]),
    " * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    " * If this bundle still executed, Rod CDN intentionally returned every asset",
    " * that succeeded instead of failing the entire response.",
    " * ============================================================================",
    " */",
  ];

  return lines.join("\n");
}

/**
 * Attaches the metadata banner and loaded-summary runtime when enabled.
 *
 * @param options Request options.
 * @param bundle Built bundle.
 * @returns Bundle code with or without metadata helpers.
 */
export function attachMetadataBanner(options: RequestOptions, bundle: BuiltBundle): string {
  const consoleRuntime = createLoadedConsoleRuntime(options, bundle);

  if (!options.metadata) {
    return [bundle.code, consoleRuntime].filter(Boolean).join("\n");
  }

  return [createMetadataBanner(options, bundle), bundle.code, consoleRuntime].filter(Boolean).join("\n");
}
