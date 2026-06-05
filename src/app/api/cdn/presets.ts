import { parseAssetSpec } from "./parser";
import type { ParsedAssetSpec } from "./types";

const PRESETS: Record<string, string[]> = {
  highlight: [
    "cdnjs:highlight.js@11.11.1/highlight.min.js(n:hljs)",
    "cdnjs:highlight.js@11.11.1/languages/javascript.min.js",
    "cdnjs:highlight.js@11.11.1/languages/css.min.js",
    "cdnjs:highlight.js@11.11.1/languages/json.min.js",
    "cdnjs:highlight.js@11.11.1/languages/xml.min.js",
    "cdnjs:highlight.js@11.11.1/languages/go.min.js",
    "cdnjs:highlight.js@11.11.1/languages/rust.min.js",
    "cdnjs:highlight.js@11.11.1/languages/typescript.min.js",
  ],
  lit: [
    "npm:lit-html@3.3.3(namespace:LitHtml)",
    "npm:lit-html@3.3.3/directives/unsafe-html.js",
    "npm:lit-html@3.3.3/directives/cache.js",
    "npm:lit-html@3.3.3/directives/repeat.js",
  ],
  
  react: [
    "cdnjs:react@19.2.7/umd/react.production.min.js(n:React)",
    "cdnjs:react-dom@19.2.7/umd/react-dom.production.min.js(n:ReactDOM)",
  ],
  solid: [
    "npm:solid-js@latest(n:Solid)",
  ],
  utils: ["npm:es-toolkit@latest(n:esToolkit)"],
  userscript: [
    "npm:lucide@0.468.0/dist/umd/lucide.js(n:lucide)",
    "npm:es-toolkit@latest(n:esToolkit)",
    "cdnjs:highlight.js@11.11.1/highlight.min.js(n:hljs)",
    "cdnjs:highlight.js@11.11.1/languages/javascript.min.js",
    "cdnjs:highlight.js@11.11.1/languages/css.min.js",
    "cdnjs:highlight.js@11.11.1/languages/json.min.js",
    "cdnjs:highlight.js@11.11.1/languages/xml.min.js",
    "cdnjs:highlight.js@11.11.1/languages/typescript.min.js",
  ],
};

PRESETS.html = PRESETS.lit;

/**
 * Expands preset names into regular parsed asset specs.
 *
 * @param presets Preset names from the query string.
 * @returns Parsed preset specs in stable order.
 *
 * @example
 * expandPresets(["highlight"]);
 * // highlight.js core plus common language files
 */
export function expandPresets(presets: readonly string[]): ParsedAssetSpec[] {
  const specs: ParsedAssetSpec[] = [];

  for (const preset of presets) {
    const entries = PRESETS[preset];

    if (!entries) {
      throw new Error(`Unknown preset: ${preset}`);
    }

    specs.push(...entries.map(parseAssetSpec));
  }

  return specs;
}

/**
 * Returns the known preset catalog for docs/debug JSON responses.
 *
 * @returns Preset catalog.
 */
export function listPresets(): Record<string, readonly string[]> {
  return PRESETS;
}
