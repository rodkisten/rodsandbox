import type { ResolvedAsset } from "./types";

const DEFAULT_GLOBALS: Record<string, string> = {
  lodash: "_",
  jquery: "jQuery",
  react: "React",
  "react-dom": "ReactDOM",
  "highlight.js": "hljs",
  lucide: "lucide",
  eruda: "eruda",
};

/**
 * Creates a safe global alias assignment for an asset.
 *
 * @param asset Resolved asset.
 * @returns JavaScript alias code or an empty string.
 */
export function createGlobalAlias(asset: ResolvedAsset): string {
  const target = asset.options.name ?? asset.options.global;
  const namespace = asset.options.namespace;

  if (namespace) {
    return `\nglobalThis[${JSON.stringify(namespace)}] = globalThis[${JSON.stringify(namespace)}] ?? {};\n`;
  }

  if (!target) {
    return "";
  }

  const knownSource = DEFAULT_GLOBALS[asset.packageName];

  if (!knownSource || knownSource === target) {
    return "";
  }

  return [
    "",
    `globalThis[${JSON.stringify(target)}] = globalThis[${JSON.stringify(target)}] ?? globalThis[${JSON.stringify(knownSource)}];`,
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
