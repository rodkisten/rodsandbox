import type { RequestOptions, ResolvedAsset } from "./types";

/***************************************************************************************************
 * Constants
 **************************************************************************************************/

const DEFAULT_GLOBAL_SOURCES: Record<string, string> = {
  lodash: "_",
  jquery: "jQuery",
  react: "React",
  "react-dom": "ReactDOM",
  "highlight.js": "hljs",
  lucide: "lucide",
  eruda: "eruda",
};

const DEFAULT_NAMESPACE_KEYS: Record<string, string> = {
  lodash: "lodash",
  jquery: "jQuery",
  react: "React",
  "react-dom": "ReactDOM",
  "highlight.js": "hljs",
  lucide: "lucide",
  eruda: "eruda",
  "es-toolkit": "esToolkit",
  "solid-js": "Solid",
  "lit-html": "LitHtml",
  shiki: "Shiki",
};

/***************************************************************************************************
 * Identifier Helpers
 **************************************************************************************************/

/**
 * Converts a package-ish name into a stable JavaScript property key.
 *
 * @param value Package name, namespace option, or requested global alias.
 * @returns Safe namespace key.
 *
 * @example
 * ```ts
 * createNamespaceKey("solid-js");
 * // "solidJs"
 * ```
 */
export function createNamespaceKey(value: string): string {
  const cleaned = value
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9_$]+(.)?/g, (_match, next: string | undefined) =>
      next ? next.toUpperCase() : "",
    )
    .replace(/^[^a-zA-Z_$]+/, "");

  return cleaned || "module";
}

/**
 * Resolves the property name used inside the global CDN namespace.
 *
 * @param asset Resolved asset metadata.
 * @returns Namespace property key.
 *
 * @example
 * ```ts
 * resolveNamespaceProperty({ packageName: "react", options: {} } as ResolvedAsset);
 * // "React"
 * ```
 */
export function resolveNamespaceProperty(asset: ResolvedAsset): string {
  return (
    asset.options.name ??
    asset.options.namespace ??
    asset.options.global ??
    DEFAULT_NAMESPACE_KEYS[asset.packageName] ??
    createNamespaceKey(asset.packageName)
  );
}

/**
 * Resolves the global variable usually created by a UMD/browser build.
 *
 * @remarks
 * This is intentionally small and conservative. It is not meant to guess every package in the npm
 * galaxy. It gives the CDN pipeline enough knowledge to bridge packages whose plugins/extensions
 * expect a global variable to exist, such as `highlight.js` language packs expecting `hljs`.
 *
 * @param asset Resolved asset metadata.
 * @returns Known global source variable, when one is known.
 *
 * @example
 * ```ts
 * resolveGlobalSourceName({ packageName: "highlight.js", options: {} } as ResolvedAsset);
 * // "hljs"
 * ```
 */
export function resolveGlobalSourceName(asset: ResolvedAsset): string | null {
  return (
    DEFAULT_GLOBAL_SOURCES[asset.packageName] ?? asset.options.global ?? null
  );
}

/**
 * Creates a safe access expression for `globalThis[namespace]`.
 *
 * @param globalName Root global namespace name.
 * @returns JavaScript source expression.
 */
export function createRootNamespaceAccess(globalName: string): string {
  return `globalThis[${JSON.stringify(globalName)}]`;
}

/**
 * Creates the namespace bootstrap line used by raw and bundled outputs.
 *
 * @param globalName Root global namespace name.
 * @returns JavaScript source.
 */
export function createRootNamespaceBootstrap(globalName: string): string {
  const root = createRootNamespaceAccess(globalName);

  return `${root} = ${root} ?? {};`;
}

/**
 * Assigns a local binding into the configured root namespace.
 *
 * @param globalName Root global namespace name.
 * @param property Namespace property key.
 * @param localName Local JavaScript binding name.
 * @returns JavaScript assignment source.
 */
export function createNamespaceAssignment(
  globalName: string,
  property: string,
  localName: string,
): string {
  const root = createRootNamespaceAccess(globalName);

  return `${root}[${JSON.stringify(property)}] = ${root}[${JSON.stringify(property)}] ?? ${localName};`;
}

/**
 * Assigns a module into the root namespace while preferring a known browser global when available.
 *
 * @remarks
 * Some classic CDN files are not real ESM modules. Esbuild can wrap them, but their companion files
 * still expect a browser global. This helper keeps the public namespace nice by preferring that real
 * browser global, then falling back to `default`, then to the namespace object produced by esbuild.
 *
 * @param globalName Root global namespace name.
 * @param property Namespace property key.
 * @param localName Local esbuild import binding.
 * @param globalSource Known browser global name, when one exists.
 * @returns JavaScript assignment source.
 *
 * @example
 * ```ts
 * createNamespaceAssignmentWithFallback("RodCDN", "hljs", "mod", "hljs");
 * // globalThis["RodCDN"]["hljs"] = ...
 * ```
 */
export function createNamespaceAssignmentWithFallback(
  globalName: string,
  property: string,
  localName: string,
  globalSource: string | null,
): string {
  const root = createRootNamespaceAccess(globalName);
  const candidates = globalSource
    ? `globalThis[${JSON.stringify(globalSource)}] ?? ${localName}.default ?? ${localName}`
    : `${localName}.default ?? ${localName}`;

  return `${root}[${JSON.stringify(property)}] = ${root}[${JSON.stringify(property)}] ?? ${candidates};`;
}

/***************************************************************************************************
 * Global Bridge Helpers
 **************************************************************************************************/

/**
 * Creates a local prelude that makes known browser globals available inside esbuild module wrappers.
 *
 * @remarks
 * Esbuild wraps remote scripts as modules. Classic plugin files often reference globals as free
 * variables, for example `hljs.registerLanguage(...)`. In a wrapper, that can throw before the final
 * namespace assignment runs. This prelude creates safe local aliases from `globalThis` and the user
 * namespace so those files can execute in order without leaking extra variables.
 *
 * @param globalName Root namespace name, or null when disabled.
 * @param assets Assets that may expose known browser globals.
 * @returns JavaScript source prepended to compatible module files.
 */
export function createGlobalBridgePrelude(
  globalName: string | null,
  assets: ResolvedAsset[],
): string {
  const globalSources = Array.from(
    new Set(
      assets
        .map(resolveGlobalSourceName)
        .filter(
          (value): value is string =>
            typeof value === "string" &&
            /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value),
        ),
    ),
  );

  if (globalSources.length === 0) {
    return "";
  }

  const root = globalName ? createRootNamespaceAccess(globalName) : "null";
  const lines = [
    "/* Rod CDN global bridge prelude. */",
    globalName ? `${root} = ${root} ?? {};` : "",
  ];

  for (const source of globalSources) {
    lines.push(
      `var ${source} = globalThis[${JSON.stringify(source)}] ?? ${globalName ? `${root}[${JSON.stringify(source)}]` : "undefined"};`,
    );
  }

  return lines.filter(Boolean).join("\n");
}

/**
 * Creates a postlude that publishes a known UMD/browser global after a module executes.
 *
 * @remarks
 * The postlude understands esbuild's CommonJS wrapper shape. If a CDN file assigns `module.exports`,
 * we can mirror that value into both `globalThis.<known>` and `globalThis[namespace].<property>` before
 * the next asset executes. This is the key piece that lets `highlight.js` core initialize `hljs` before
 * language files call `hljs.registerLanguage(...)`.
 *
 * @param globalName Root namespace name, or null when disabled.
 * @param asset Asset being loaded.
 * @returns JavaScript source appended to the remote module.
 */
export function createGlobalBridgePostlude(
  globalName: string | null,
  asset: ResolvedAsset,
): string {
  const source = resolveGlobalSourceName(asset);

  if (!source || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(source)) {
    return "";
  }

  const property = resolveNamespaceProperty(asset);
  const root = globalName ? createRootNamespaceAccess(globalName) : "null";
  const exportedExpression = [
    `(typeof module !== "undefined" && module.exports ? module.exports.default : undefined)`,
    `(typeof module !== "undefined" && module.exports ? module.exports : undefined)`,
    `(typeof exports !== "undefined" && exports ? exports.default : undefined)`,
    `(typeof exports !== "undefined" && exports ? exports : undefined)`,
    `(typeof ${source} !== "undefined" ? ${source} : undefined)`,
  ].join(" ?? ");

  return [
    "",
    "/* Rod CDN global bridge postlude. */",
    `var __rodCdnGlobalValue_${createNamespaceKey(source)} = ${exportedExpression};`,
    `if (__rodCdnGlobalValue_${createNamespaceKey(source)} !== undefined) {`,
    `  globalThis[${JSON.stringify(source)}] = globalThis[${JSON.stringify(source)}] ?? __rodCdnGlobalValue_${createNamespaceKey(source)};`,
    globalName ? `  ${root} = ${root} ?? {};` : "",
    globalName
      ? `  ${root}[${JSON.stringify(property)}] = ${root}[${JSON.stringify(property)}] ?? globalThis[${JSON.stringify(source)}];`
      : "",
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Creates a safe global alias assignment for raw UMD-style assets.
 *
 * @remarks
 * Raw mode cannot see ESM exports. It can only copy globals created by the loaded script into the
 * configured namespace. Bundled mode uses the virtual entrypoint instead and does not rely on this.
 *
 * @param options Request-level options.
 * @param asset Resolved asset.
 * @returns JavaScript alias code or an empty string.
 */
export function createGlobalAlias(
  options: RequestOptions,
  asset: ResolvedAsset,
): string {
  if (!options.expose || !options.globalName) {
    return "";
  }

  const knownSource = resolveGlobalSourceName(asset);

  if (!knownSource) {
    return "";
  }

  const property = resolveNamespaceProperty(asset);
  const root = createRootNamespaceAccess(options.globalName);

  return [
    "",
    createRootNamespaceBootstrap(options.globalName),
    `if (${root}[${JSON.stringify(property)}] === undefined && globalThis[${JSON.stringify(knownSource)}] !== undefined) {`,
    `  ${root}[${JSON.stringify(property)}] = globalThis[${JSON.stringify(knownSource)}];`,
    "}",
  ].join("\n");
}

/**
 * Wraps generated code in a defensive IIFE for userscript-style loading.
 *
 * @param code Bundle code.
 * @returns IIFE-wrapped code.
 */
export function wrapInIife(code: string): string {
  return `;(function rodCdnBundle(globalThis) {\n\"use strict\";\n${code}\n})(globalThis);\n`;
}
