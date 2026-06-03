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
    .replace(/[^a-zA-Z0-9_$]+(.)?/g, (_match, next: string | undefined) => (next ? next.toUpperCase() : ""))
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
export function createNamespaceAssignment(globalName: string, property: string, localName: string): string {
  const root = createRootNamespaceAccess(globalName);

  return `${root}[${JSON.stringify(property)}] = ${root}[${JSON.stringify(property)}] ?? ${localName};`;
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
export function createGlobalAlias(options: RequestOptions, asset: ResolvedAsset): string {
  if (!options.expose || !options.globalName) {
    return "";
  }

  const knownSource = DEFAULT_GLOBAL_SOURCES[asset.packageName] ?? asset.options.global;

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
