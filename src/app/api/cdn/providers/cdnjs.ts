import { CDNJS_API_BASE, CDNJS_ASSET_BASE } from "../constants";
import type { ParsedAssetSpec, ResolvedAsset } from "../types";

type CdnjsLibraryResponse = {
  readonly version: string;
  readonly filename: string;
};

/**
 * Resolves the latest version and default file for a cdnjs library.
 *
 * @param packageName Library name on cdnjs.
 * @returns Latest version string and default filename.
 */
async function resolveCdnjsLatest(packageName: string): Promise<{ readonly version: string; readonly filename: string }> {
  const url = `${CDNJS_API_BASE}/${encodeURIComponent(packageName)}?fields=version,filename`;
  const response = await fetch(url, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`cdnjs: failed to resolve ${packageName}: ${response.status}`);
  }

  const data = (await response.json()) as CdnjsLibraryResponse;

  if (!data.version || !data.filename) {
    throw new Error(`cdnjs: unexpected response for ${packageName}`);
  }

  return { version: data.version, filename: data.filename };
}

/**
 * Resolves a cdnjs asset spec into a concrete URL and metadata.
 *
 * @param spec Parsed asset spec with provider "cdnjs".
 * @returns Resolved asset ready for download.
 */
export async function resolveCdnjs(spec: ParsedAssetSpec): Promise<ResolvedAsset> {
  const warnings: string[] = [];
  let { version } = spec;
  let file = spec.file;

  if (!version || !file) {
    const latest = await resolveCdnjsLatest(spec.packageName);
    version = version ?? latest.version;
    file = file ?? latest.filename;
    if (!spec.version) {
      warnings.push(`cdnjs: resolved latest version for ${spec.packageName}: ${version}`);
    }
  }

  const url = `${CDNJS_ASSET_BASE}/${spec.packageName}/${version}/${file}`;

  return {
    provider: "cdnjs",
    packageName: spec.packageName,
    version,
    file,
    url,
    sourceLabel: `${spec.packageName}@${version}/${file}`,
    options: spec.options,
    warnings,
  };
}
