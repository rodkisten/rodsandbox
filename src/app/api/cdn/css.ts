import crypto from "node:crypto";
import { transform } from "esbuild";
import type { AssetFailure, RequestOptions, ResolvedAsset } from "./types";
import { createRootNamespaceAccess, createRootNamespaceBootstrap } from "./globals";

/***************************************************************************************************
 * Constants
 **************************************************************************************************/

const CSS_HASH_ALGORITHM = "sha256";
const CSS_HASH_ENCODING = "hex";
const DEFAULT_STYLE_ID_PREFIX = "rod-cdn-style";

/***************************************************************************************************
 * Download + Minification
 **************************************************************************************************/

/**
 * Creates headers for direct raw GitHub CSS downloads when a token is configured.
 *
 * @param asset Concrete CSS asset.
 * @returns Fetch headers.
 */
function createCssFetchHeaders(asset: ResolvedAsset): Record<string, string> | undefined {
  if (asset.provider !== "github") {
    return undefined;
  }

  const token = process.env["GITHUB_TOKEN"] ?? process.env["GIST_TOKEN"];

  if (!token || !asset.url.includes("raw.githubusercontent.com")) {
    return undefined;
  }

  return { Authorization: `Bearer ${token}` };
}

/**
 * Downloads a resolved CSS asset as plain text.
 *
 * @param asset Resolved CSS asset.
 * @returns Raw CSS text.
 *
 * @example
 * ```ts
 * const css = await downloadCssAsset(asset);
 * console.log(css.includes("{"));
 * ```
 */
async function downloadCssAsset(asset: ResolvedAsset): Promise<string> {
  const response = await fetch(asset.url, {
    cache: "force-cache",
    headers: createCssFetchHeaders(asset),
  });

  if (!response.ok) {
    throw new Error(`Failed to download CSS ${asset.sourceLabel}: ${response.status}`);
  }

  return response.text();
}

/**
 * Minifies CSS through esbuild. CSS is always minified, independent from JS minification flags.
 *
 * @param source Raw CSS source.
 * @returns Minified CSS.
 *
 * @example
 * ```ts
 * await minifyCss(".x { color: red; }");
 * // ".x{color:red}"
 * ```
 */
async function minifyCss(source: string): Promise<string> {
  const result = await transform(source, {
    loader: "css",
    minify: true,
    legalComments: "none",
  });

  return result.code.trim();
}

/***************************************************************************************************
 * Hash + Runtime Helpers
 **************************************************************************************************/

/**
 * Creates a short stable hash used in style IDs and metadata attributes.
 *
 * @param value Content to hash.
 * @returns Short SHA-256 hash.
 *
 * @example
 * ```ts
 * createShortHash("body{}");
 * // "a1b2c3d4e5f6"
 * ```
 */
function createShortHash(value: string): string {
  return crypto.createHash(CSS_HASH_ALGORITHM).update(value).digest(CSS_HASH_ENCODING).slice(0, 12);
}

/**
 * Resolves the final style element ID for the CSS payload.
 *
 * @param options Request options.
 * @param css Minified CSS.
 * @returns Stable style element ID.
 *
 * @example
 * ```ts
 * createStyleId(options, ".x{}");
 * // "rod-cdn-style-a1b2c3d4e5f6"
 * ```
 */
function createStyleId(options: RequestOptions, css: string): string {
  if (options.cssId) {
    return options.cssId;
  }

  return `${DEFAULT_STYLE_ID_PREFIX}-${createShortHash(css)}`;
}

/**
 * Creates JavaScript that installs minified CSS into document or a passed ShadowRoot.
 *
 * @remarks
 * The generated helper is exposed as `RodCDN.injectStyles(target?)` by default. Passing a
 * `ShadowRoot` injects the same style into that shadow tree. Repeated calls dedupe by ID.
 *
 * @param options Request options.
 * @param css Minified CSS payload.
 * @param cssAssets CSS assets included in the payload.
 * @returns JavaScript runtime source.
 *
 * @example
 * ```ts
 * createCssRuntime(options, ".x{}", assets);
 * // Defines injectStyles and optionally calls it for document.head.
 * ```
 */
export function createCssRuntime(options: RequestOptions, css: string, cssAssets: readonly ResolvedAsset[]): string {
  if (!css || !options.cssInject) {
    return "";
  }

  const styleId = createStyleId(options, css);
  const cssHash = createShortHash(css);
  const packageList = cssAssets.map((asset) => asset.sourceLabel).join(",");
  const globalName = options.globalName ?? "RodCDN";
  const namespaceBootstrap = createRootNamespaceBootstrap(globalName);
  const namespaceAccess = createRootNamespaceAccess(globalName);
  const shouldAutoInject = options.cssTarget === "document";

  return [
    ";",
    "(function rodCdnCssRuntime(globalThis) {",
    '  "use strict";',
    `  var CSS_TEXT = ${JSON.stringify(css)};`,
    `  var STYLE_ID = ${JSON.stringify(styleId)};`,
    `  var CSS_HASH = ${JSON.stringify(cssHash)};`,
    `  var CSS_PACKAGES = ${JSON.stringify(packageList)};`,
    "  function resolveDocument(target) {",
    "    if (target && target.ownerDocument) return target.ownerDocument;",
    "    if (target && target.nodeType === 9) return target;",
    "    return globalThis.document || null;",
    "  }",
    "  function resolveContainer(target) {",
    "    if (!target) return globalThis.document ? globalThis.document.head : null;",
    "    if (target.nodeType === 9) return target.head || target.documentElement;",
    "    if (target.nodeType === 11) return target;",
    "    if (target.head) return target.head;",
    "    if (target.appendChild) return target;",
    "    return globalThis.document ? globalThis.document.head : null;",
    "  }",
    "  function findExisting(container) {",
    "    if (!container) return null;",
    "    if (typeof container.getElementById === 'function') return container.getElementById(STYLE_ID);",
    "    if (typeof container.querySelector === 'function') {",
    "      var escapedId = globalThis.CSS && typeof globalThis.CSS.escape === 'function' ? globalThis.CSS.escape(STYLE_ID) : STYLE_ID.replace(/[^a-zA-Z0-9_-]/g, '\\$&');",
    "      return container.querySelector('#' + escapedId);",
    "    }",
    "    return null;",
    "  }",
    "  function readNonce(doc) {",
    "    if (!doc || typeof doc.querySelector !== 'function') return '';",
    "    var node = doc.querySelector('script[nonce],style[nonce]');",
    "    return node && node.nonce ? node.nonce : '';",
    "  }",
    "  function injectStyles(target) {",
    "    var container = resolveContainer(target);",
    "    if (!container) return null;",
    "    var existing = findExisting(container);",
    "    if (existing) return existing;",
    "    var doc = resolveDocument(container);",
    "    if (!doc || !doc.createElement) return null;",
    "    var style = doc.createElement('style');",
    "    style.id = STYLE_ID;",
    "    style.type = 'text/css';",
    "    style.setAttribute('data-rod-cdn', 'true');",
    "    style.setAttribute('data-rod-cdn-hash', CSS_HASH);",
    "    style.setAttribute('data-rod-cdn-packages', CSS_PACKAGES);",
    "    var nonce = readNonce(doc);",
    "    if (nonce) style.setAttribute('nonce', nonce);",
    "    style.appendChild(doc.createTextNode(CSS_TEXT));",
    "    container.appendChild(style);",
    "    return style;",
    "  }",
    `  ${namespaceBootstrap}`,
    `  ${namespaceAccess}.injectStyles = injectStyles;`,
    `  ${namespaceAccess}.css = ${namespaceAccess}.css || {};`,
    `  ${namespaceAccess}.css[STYLE_ID] = { id: STYLE_ID, hash: CSS_HASH, packages: CSS_PACKAGES };`,
    shouldAutoInject ? "  injectStyles(globalThis.document);" : "",
    "})(globalThis);",
  ].filter(Boolean).join("\n");
}

/**
 * Downloads and minifies all CSS assets into a single CSS payload.
 *
 * @param cssAssets Resolved CSS assets.
 * @returns Minified CSS and warnings.
 *
 * @example
 * ```ts
 * const result = await buildCssPayload(cssAssets);
 * console.log(result.css.length);
 * ```
 */
export async function buildCssPayload(cssAssets: readonly ResolvedAsset[]): Promise<{
  readonly css: string;
  readonly warnings: readonly string[];
  readonly failures: readonly AssetFailure[];
}> {
  const warnings = [...cssAssets.flatMap((asset) => asset.warnings)];
  const failures: AssetFailure[] = [];

  if (cssAssets.length === 0) {
    return { css: "", warnings, failures };
  }

  const chunks: string[] = [];

  for (const asset of cssAssets) {
    try {
      const raw = await downloadCssAsset(asset);
      const minified = await minifyCss(raw);
      chunks.push(`/* ${asset.sourceLabel} */\n${minified}`);
    } catch (error) {
      failures.push({
        stage: "css",
        sourceLabel: asset.sourceLabel,
        provider: asset.provider,
        packageName: asset.packageName,
        version: asset.version,
        file: asset.file,
        url: asset.url,
        message: error instanceof Error ? error.message : "Unknown CSS asset failure",
      });
    }
  }

  return {
    css: chunks.join("\n"),
    warnings,
    failures,
  };
}

/**
 * Creates the style ID that the request will use. Exported for metadata banners.
 *
 * @param options Request options.
 * @param css Minified CSS.
 * @returns Style element ID or null when there is no CSS.
 */
export function resolveStyleId(options: RequestOptions, css: string): string | null {
  if (!css) {
    return null;
  }

  return createStyleId(options, css);
}
