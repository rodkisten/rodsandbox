import crypto from "node:crypto";
import { build, type Loader, type OnLoadArgs, type OnResolveArgs, type Plugin } from "esbuild";
import { ESM_SH_BASE, JSDELIVR_NPM_BASE } from "./constants";
import type { AssetFailure, BuiltBundle, BundleMode, RequestOptions, ResolvedAsset } from "./types";
import { readCachedBundle, writeCachedBundle } from "./cache";
import { buildCssPayload, createCssRuntime, resolveStyleId } from "./css";
import { createNamespaceAssignment, createRootNamespaceBootstrap, resolveNamespaceProperty } from "./globals";

/***************************************************************************************************
 * Constants
 **************************************************************************************************/

const HTTP_NAMESPACE = "rod-http";
const VIRTUAL_NAMESPACE = "rod-virtual";
const VIRTUAL_ENTRY_PATH = "rod-cdn-entry.ts";
const JAVASCRIPT_LOADER_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);

/***************************************************************************************************
 * Small Helpers
 **************************************************************************************************/

/**
 * Sanitizes a package name into a readable JavaScript identifier suffix.
 *
 * @param value Package name or requested global name.
 * @returns Safe identifier suffix.
 *
 * @example
 * ```ts
 * toIdentifierSuffix("solid-js");
 * // "solid_js"
 * ```
 */
function toIdentifierSuffix(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_$]/g, "_");

  if (/^[a-zA-Z_$]/.test(safe)) {
    return safe;
  }

  return `_${safe}`;
}

/**
 * Resolves the property name used for one asset inside the configured CDN namespace.
 *
 * @param asset Resolved asset.
 * @returns Namespace property key.
 */
function resolveAssetNamespaceProperty(asset: ResolvedAsset): string {
  return resolveNamespaceProperty(asset);
}

/**
 * Resolves the import URL used by the esbuild pipeline.
 *
 * @remarks
 * For CDN/gist files we keep the already resolved URL. For npm packages with no explicit file, or when
 * the request uses `entry=...`, we prefer ESM-aware providers so modern packages like Shiki, Lit and
 * Solid can be transformed into IIFE/ESM/CJS output safely.
 *
 * @param options Request options.
 * @param asset Resolved asset.
 * @param index Asset index.
 * @returns Import URL to place in the virtual entrypoint.
 */
function resolveModuleImportUrl(options: RequestOptions, asset: ResolvedAsset, index: number): string {
  const requestedEntry = index === 0 ? options.entry : null;

  if (asset.provider !== "npm") {
    return asset.url;
  }

  const entry = requestedEntry ?? asset.file;
  const entryWithoutPackage = entry.startsWith(`${asset.packageName}/`)
    ? entry.slice(asset.packageName.length + 1)
    : entry;
  const normalizedEntry = entryWithoutPackage.replace(/^\.\/+/, "").replace(/^\/+/, "");

  if (options.bundleProvider === "jsdelivr") {
    const jsdelivrBase = `${JSDELIVR_NPM_BASE}/${asset.packageName}@${asset.version}`;
    const jsdelivrPath = normalizedEntry ? `${jsdelivrBase}/${normalizedEntry}` : jsdelivrBase;

    return `${jsdelivrPath}/+esm`;
  }

  const packageBase = `${ESM_SH_BASE}/${asset.packageName}@${asset.version}`;
  const packagePath = normalizedEntry ? `${packageBase}/${normalizedEntry}` : packageBase;
  const params = new URLSearchParams({
    bundle: "",
    target: "es2022",
    no_dts: "",
  });

  return `${packagePath}?${params.toString()}`;
}

/**
 * Maps esbuild bundle mode to its output format.
 *
 * @param bundleMode Requested bundle mode.
 * @returns esbuild output format.
 */
function toEsbuildFormat(bundleMode: BundleMode): "iife" | "esm" | "cjs" {
  if (bundleMode === "raw") {
    return "iife";
  }

  return bundleMode;
}

/**
 * Chooses an esbuild loader from a URL path.
 *
 * @param pathname URL pathname.
 * @returns esbuild loader.
 */
function guessLoader(pathname: string): Loader {
  if (pathname.endsWith(".json")) return "json";
  if (pathname.endsWith(".css")) return "text";
  if (pathname.endsWith(".tsx")) return "tsx";
  if (pathname.endsWith(".ts")) return "ts";
  if (pathname.endsWith(".jsx")) return "jsx";

  return "js";
}

/**
 * Checks whether a URL points to a JavaScript-like file.
 *
 * @param url URL to inspect.
 * @returns Whether the URL looks JavaScript-like.
 */
function isJavaScriptLikeUrl(url: string): boolean {
  const pathname = new URL(url).pathname;
  const extension = pathname.slice(pathname.lastIndexOf("."));

  return !extension || JAVASCRIPT_LOADER_EXTENSIONS.has(extension);
}

/***************************************************************************************************
 * Virtual Entry
 **************************************************************************************************/

/**
 * Creates an in-memory entrypoint for esbuild.
 *
 * @param options Request options.
 * @param assets Ordered assets.
 * @returns Virtual TypeScript module source.
 */
function createVirtualEntry(options: RequestOptions, assets: readonly ResolvedAsset[]): string {
  const lines: string[] = [];

  if (options.expose && options.globalName && options.bundleMode !== "esm") {
    lines.push(createRootNamespaceBootstrap(options.globalName));
  }

  assets.forEach((asset, index) => {
    const localName = `__rod_cdn_module_${index}_${toIdentifierSuffix(asset.packageName)}`;
    const importUrl = resolveModuleImportUrl(options, asset, index);
    const namespaceProperty = resolveAssetNamespaceProperty(asset);

    lines.push(`import * as ${localName} from ${JSON.stringify(importUrl)};`);

    if (options.expose && options.globalName && options.bundleMode !== "esm") {
      lines.push(createNamespaceAssignment(options.globalName, namespaceProperty, localName));
    }

    if (options.bundleMode === "esm") {
      const exportName = toIdentifierSuffix(namespaceProperty);
      lines.push(`export { ${localName} as ${exportName} };`);

      if (index === 0) {
        lines.push(`export default ${localName};`);
      }
    }
  });

  return lines.join("\n");
}

/***************************************************************************************************
 * esbuild Plugins
 **************************************************************************************************/

/**
 * Creates a virtual-entry plugin that feeds esbuild from memory.
 *
 * @param contents Virtual entry contents.
 * @returns esbuild plugin.
 */
function createVirtualEntryPlugin(contents: string): Plugin {
  return {
    name: "rod-cdn-virtual-entry",
    setup(api) {
      api.onResolve({ filter: new RegExp(`^${VIRTUAL_ENTRY_PATH}$`) }, () => ({
        path: VIRTUAL_ENTRY_PATH,
        namespace: VIRTUAL_NAMESPACE,
      }));

      api.onLoad({ filter: /.*/, namespace: VIRTUAL_NAMESPACE }, () => ({
        contents,
        loader: "ts",
        resolveDir: "/",
      }));
    },
  };
}

/**
 * Creates an HTTP loader plugin so esbuild can bundle CDN and ESM provider URLs.
 *
 * @param external Package names that should remain external.
 * @returns esbuild plugin.
 */
function createHttpPlugin(external: readonly string[], failures: AssetFailure[]): Plugin {
  const externalPackages = new Set(external);
  const memoryCache = new Map<string, string>();

  return {
    name: "rod-cdn-http-loader",
    setup(api) {
      api.onResolve({ filter: /^https?:\/\// }, (args: OnResolveArgs) => ({
        path: args.path,
        namespace: HTTP_NAMESPACE,
      }));

      api.onResolve({ filter: /^\//, namespace: HTTP_NAMESPACE }, (args: OnResolveArgs) => {
        const importer = new URL(args.importer);
        const resolved = new URL(args.path, `${importer.protocol}//${importer.host}`).toString();

        return {
          path: resolved,
          namespace: HTTP_NAMESPACE,
        };
      });

      api.onResolve({ filter: /^\.\.?\//, namespace: HTTP_NAMESPACE }, (args: OnResolveArgs) => ({
        path: new URL(args.path, args.importer).toString(),
        namespace: HTTP_NAMESPACE,
      }));

      api.onResolve({ filter: /^[^./][^:]*$/, namespace: HTTP_NAMESPACE }, (args: OnResolveArgs) => {
        if (externalPackages.has(args.path)) {
          return {
            path: args.path,
            external: true,
          };
        }

        return {
          path: `${ESM_SH_BASE}/${args.path}?bundle&target=es2022&no_dts`,
          namespace: HTTP_NAMESPACE,
        };
      });

      api.onLoad({ filter: /.*/, namespace: HTTP_NAMESPACE }, async (args: OnLoadArgs) => {
        const cached = memoryCache.get(args.path);

        if (cached !== undefined) {
          return {
            contents: cached,
            loader: guessLoader(new URL(args.path).pathname),
          };
        }

        const response = await fetch(args.path, { cache: "force-cache" });

        if (!response.ok) {
          failures.push({
            stage: "bundle",
            sourceLabel: args.path,
            url: args.path,
            message: `esbuild: failed to fetch ${args.path}: ${response.status}`,
          });

          return {
            contents: "export default {};",
            loader: "js",
          };
        }

        const contents = await response.text();
        memoryCache.set(args.path, contents);

        return {
          contents,
          loader: guessLoader(new URL(args.path).pathname),
        };
      });
    },
  };
}

/***************************************************************************************************
 * Public API
 **************************************************************************************************/

/**
 * Builds ESM/import-based packages into the requested browser-friendly format.
 *
 * @param options Request options.
 * @param assets Resolved assets used as entry descriptors.
 * @returns Built bundle.
 *
 * @example
 * ```ts
 * await buildModuleBundle(options, assets);
 * // Supports /api/cdn?pkg=shiki@4.2.0&entry=shiki/bundle/web&bundle=iife&global=Shiki
 * ```
 */
export async function buildModuleBundle(
  options: RequestOptions,
  assets: readonly ResolvedAsset[],
  cssAssets: readonly ResolvedAsset[] = [],
  initialFailures: readonly AssetFailure[] = [],
): Promise<BuiltBundle> {
  const cssPayload = await buildCssPayload(cssAssets);
  const cssStyleId = resolveStyleId(options, cssPayload.css);
  const cssRuntime = createCssRuntime(options, cssPayload.css, cssAssets);
  const warnings = [...assets.flatMap((asset) => asset.warnings), ...cssPayload.warnings];
  const failures: AssetFailure[] = [...initialFailures, ...cssPayload.failures];
  const virtualEntry = [createVirtualEntry(options, assets), cssRuntime].filter(Boolean).join("\n");
  const cacheKey = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        mode: "esbuild-module",
        bundleMode: options.bundleMode,
        minify: options.minify,
        entry: options.entry,
        globalName: options.globalName,
        provider: options.bundleProvider,
        external: options.external,
        assets,
        cssAssets,
        virtualEntry,
      }),
    )
    .digest("hex");

  const cached = await readCachedBundle(cacheKey);

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

  let code = "";

  try {
    const result = await build({
    entryPoints: [VIRTUAL_ENTRY_PATH],
    bundle: true,
    write: false,
    minify: options.minify,
    sourcemap: false,
    legalComments: options.removeComments ? "none" : "inline",
    target: "es2022",
    platform: options.platform,
    format: toEsbuildFormat(options.bundleMode),
    external: [...options.external],
    plugins: [createVirtualEntryPlugin(virtualEntry), createHttpPlugin(options.external, failures)],
    logLevel: "silent",
    });

    const output = result.outputFiles[0];

    if (!output) {
      throw new Error("esbuild did not produce an output file.");
    }

    code = output.text;

    if (options.debug) {
      code = [`/* Virtual entry:\n${virtualEntry}\n*/`, code].join("\n");
    }
  } catch (error) {
    failures.push({
      stage: "bundle",
      sourceLabel: "esbuild bundle",
      message: error instanceof Error ? error.message : "Unknown esbuild bundling failure",
    });

    code = cssRuntime;
  }

  if (!assets.every((asset, index) => isJavaScriptLikeUrl(resolveModuleImportUrl(options, asset, index)))) {
    warnings.push("Some bundled assets were not JavaScript-like URLs; esbuild loaded them with fallback loaders.");
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
