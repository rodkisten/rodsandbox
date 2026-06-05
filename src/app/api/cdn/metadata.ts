import { resolveNamespaceProperty } from "./globals";
import type { AssetFailure, BuiltBundle, RequestOptions, ResolvedAsset } from "./types";

/***************************************************************************************************
 * Constants
 **************************************************************************************************/

const ASCII_PANEL_WIDTH = 80;
const ASCII_PANEL_INNER_WIDTH = ASCII_PANEL_WIDTH - 4;

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
 * Safely truncates text for compact one-line metadata rows.
 *
 * @param value Raw value.
 * @param maxLength Maximum visible length.
 * @returns Truncated value.
 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return "…";
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

/**
 * Pads a string on the right side.
 *
 * @param value Raw value.
 * @param width Desired width.
 * @returns Padded value.
 */
function padRight(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

/**
 * Wraps text into lines that fit inside the ASCII panel.
 *
 * @param value Raw value.
 * @param width Maximum line width.
 * @returns Wrapped lines.
 */
function wrapText(value: string, width: number): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return [""];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }

      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }

      continue;
    }

    const next = current ? `${current} ${word}` : word;

    if (next.length > width) {
      lines.push(current);
      current = word;
      continue;
    }

    current = next;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

/**
 * Creates one ASCII panel line.
 *
 * @param value Text for the line.
 * @returns Comment-prefixed panel line.
 */
function panelLine(value = ""): string {
  return ` * │ ${padRight(value, ASCII_PANEL_INNER_WIDTH)} │`;
}

/**
 * Creates a horizontal ASCII panel border.
 *
 * @param left Left border glyph.
 * @param fill Fill glyph.
 * @param right Right border glyph.
 * @returns Comment-prefixed border.
 */
function panelBorder(left: string, fill: string, right: string): string {
  return ` * ${left}${fill.repeat(ASCII_PANEL_WIDTH - 2)}${right}`;
}

/**
 * Creates wrapped key/value lines for the ASCII panel.
 *
 * @param label Field label.
 * @param value Field value.
 * @returns Comment-prefixed panel lines.
 */
function panelField(label: string, value: string): string[] {
  const prefix = `${label}: `;
  const firstWidth = ASCII_PANEL_INNER_WIDTH - prefix.length;
  const wrapped = wrapText(value, Math.max(12, firstWidth));
  const lines = [panelLine(`${prefix}${wrapped[0] ?? ""}`)];

  for (const extraLine of wrapped.slice(1)) {
    lines.push(panelLine(`${" ".repeat(prefix.length)}${extraLine}`));
  }

  return lines;
}

/**
 * Formats one successful asset line for the generated bundle banner.
 *
 * @param asset Successful asset metadata.
 * @returns Banner line.
 */
function formatSuccessfulAssetLine(asset: ResolvedAsset): string {
  const property = resolveNamespaceProperty(asset);
  const label = truncate(asset.sourceLabel, 44);
  const url = truncate(asset.url, 72);

  return ` * - ${label} via ${asset.provider}; namespace key: ${property}; url: ${url}`;
}

/**
 * Builds a compact and readable ASCII panel for failed assets.
 *
 * @param failures Failed asset metadata.
 * @returns Banner lines.
 */
function createFailurePanel(failures: AssetFailure[]): string[] {
  if (failures.length === 0) {
    return [];
  }

  const lines = [
    " *",
    panelBorder("┌", "─", "┐"),
    panelLine("FAILED ASSETS / PARTIAL LOAD REPORT"),
    panelBorder("├", "─", "┤"),
    panelLine(`Total failures: ${failures.length}`),
  ];

  failures.forEach((failure, index) => {
    const provider = failure.provider ?? "unknown";
    const url = failure.url ?? "none";

    lines.push(panelBorder("├", "─", "┤"));
    lines.push(panelLine(`#${index + 1}`));
    lines.push(...panelField("stage", failure.stage));
    lines.push(...panelField("asset", failure.sourceLabel));
    lines.push(...panelField("provider", provider));
    lines.push(...panelField("reason", failure.message));
    lines.push(...panelField("url", url));
  });

  lines.push(panelBorder("├", "─", "┤"));
  lines.push(...wrapText("Rod CDN returned every asset that succeeded instead of failing the entire response.", ASCII_PANEL_INNER_WIDTH).map(panelLine));
  lines.push(panelBorder("└", "─", "┘"));

  return lines;
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
  const expectedGlobals = Array.from(new Set(bundle.assets.map(resolveNamespaceProperty)));
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
  const failurePanel = createFailurePanel(bundle.failures);

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
    ...failurePanel,
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
