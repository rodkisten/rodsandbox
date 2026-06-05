import { resolveNpm } from "./npm";
import type { ParsedAssetSpec, ResolvedAsset } from "../types";

/**
 * Resolves an npm package through jsDelivr explicitly.
 *
 * @remarks
 * The existing npm resolver already uses jsDelivr for the concrete CDN URL. This wrapper keeps
 * provider metadata honest so fallback reports, response headers and the generated banner can show
 * that jsDelivr was the provider that succeeded.
 *
 * @param spec Parsed package spec.
 * @returns Resolved jsDelivr asset.
 *
 * @example
 * ```ts
 * const asset = await resolveJsdelivr({
 *   raw: "lodash",
 *   provider: "jsdelivr",
 *   packageName: "lodash",
 *   version: null,
 *   file: null,
 *   options: {},
 * });
 *
 * console.log(asset.provider);
 * // "jsdelivr"
 * ```
 */
export async function resolveJsdelivr(spec: ParsedAssetSpec): Promise<ResolvedAsset> {
  const asset = await resolveNpm({ ...spec, provider: "npm" });

  return {
    ...asset,
    provider: "jsdelivr",
    warnings: asset.warnings.map((warning) => warning.replace(/^npm:/, "jsdelivr:")),
  };
}
