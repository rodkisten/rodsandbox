import { JSDELIVR_NPM_BASE, NPM_REGISTRY_BASE } from "../constants";
import type { ParsedAssetSpec, ResolvedAsset } from "../types";

type NpmDistTags = {
  readonly latest: string;
};

type NpmPackageResponse = {
  readonly "dist-tags": NpmDistTags;
  readonly main?: string;
  readonly module?: string;
  readonly browser?: string | Record<string, string | false>;
};

/**
 * Resolves the latest published version of an npm package.
 *
 * @param packageName npm package name.
 * @returns Latest version string and best-effort default file path.
 */
async function resolveNpmLatest(packageName: string): Promise<{ readonly version: string; readonly file: string | null }> {
  const url = `${NPM_REGISTRY_BASE}/${encodeURIComponent(packageName).replace(/%40/g, "@")}/latest`;
  const response = await fetch(url, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`npm: failed to resolve ${packageName}: ${response.status}`);
  }

  const data = (await response.json()) as NpmPackageResponse;
  const version = data["dist-tags"]?.latest;

  if (!version) {
    throw new Error(`npm: no latest dist-tag for ${packageName}`);
  }

  const browser = data.browser;
  const file =
    typeof browser === "string"
      ? browser
      : data.module ?? data.main ?? null;

  return { version, file };
}

/**
 * Resolves an npm asset spec via jsDelivr into a concrete URL and metadata.
 *
 * @param spec Parsed asset spec with provider "npm".
 * @returns Resolved asset ready for download.
 */
export async function resolveNpm(spec: ParsedAssetSpec): Promise<ResolvedAsset> {
  const warnings: string[] = [];
  let { version } = spec;
  let file = spec.file;

  if (!version || version === "latest" || !file) {
    const latest = await resolveNpmLatest(spec.packageName);

    if (!version || version === "latest") {
      version = latest.version;
      warnings.push(`npm: resolved latest version for ${spec.packageName}: ${version}`);
    }

    file = file ?? latest.file;
  }

  if (!file) {
    throw new Error(`npm: could not determine a default file for ${spec.packageName}@${version}. Specify a file path explicitly.`);
  }

  const url = `${JSDELIVR_NPM_BASE}/${spec.packageName}@${version}/${file}`;

  return {
    provider: "npm",
    packageName: spec.packageName,
    version,
    file,
    url,
    sourceLabel: `${spec.packageName}@${version}/${file}`,
    options: spec.options,
    warnings,
  };
}
