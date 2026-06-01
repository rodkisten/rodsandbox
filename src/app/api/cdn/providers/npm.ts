import { JSDELIVR_NPM_BASE, NPM_REGISTRY_BASE } from "../constants";
import type { ParsedAssetSpec, ResolvedAsset } from "../types";

type NpmDistTags = {
  readonly latest?: string;
};

type NpmExportsValue =
  | string
  | readonly string[]
  | {
      readonly browser?: NpmExportsValue;
      readonly import?: NpmExportsValue;
      readonly require?: NpmExportsValue;
      readonly default?: NpmExportsValue;
      readonly development?: NpmExportsValue;
      readonly production?: NpmExportsValue;
      readonly node?: NpmExportsValue;
      readonly types?: NpmExportsValue;
    }
  | Record<string, unknown>;

type NpmPackageResponse = {
  readonly name?: string;
  readonly version?: string;
  readonly "dist-tags"?: NpmDistTags;
  readonly main?: string;
  readonly module?: string;
  readonly browser?: string | Record<string, string | false>;
  readonly unpkg?: string;
  readonly jsdelivr?: string;
  readonly exports?: NpmExportsValue;
};

type ResolvedNpmLatest = {
  readonly version: string;
  readonly file: string | null;
};

/**
 * Encodes an npm package name for registry requests.
 *
 * @remarks
 * npm accepts scoped packages as `@scope%2Fname`. Keeping `@` readable makes
 * logs and error messages easier to inspect while still safely encoding `/`.
 *
 * @param packageName npm package name.
 * @returns Registry-safe package name.
 *
 * @example
 * ```ts
 * encodeNpmRegistryPackageName("@scope/pkg");
 * // "@scope%2Fpkg"
 * ```
 */
function encodeNpmRegistryPackageName(packageName: string): string {
  return encodeURIComponent(packageName).replace(/%40/g, "@");
}

/**
 * Removes leading slashes from a CDN file path.
 *
 * @remarks
 * jsDelivr paths are relative to the package root. A leading slash can produce
 * a malformed URL where the package version segment looks correct but the file
 * path is treated inconsistently by downstream tooling.
 *
 * @param file Candidate file path.
 * @returns Normalized relative file path.
 *
 * @example
 * ```ts
 * normalizeCdnFilePath("/dist/index.js");
 * // "dist/index.js"
 * ```
 */
function normalizeCdnFilePath(file: string): string {
  return file.replace(/^\/+/, "");
}

/**
 * Resolves a string-like export target from an npm `exports` value.
 *
 * @remarks
 * This intentionally stays conservative. `exports` can be a complex conditional
 * graph, so this helper only extracts obvious browser/import/default string
 * paths without trying to fully emulate Node resolution.
 *
 * @param value npm exports value.
 * @returns Best-effort file path, or null when no safe path is found.
 *
 * @example
 * ```ts
 * resolveExportFile({ import: "./dist/index.mjs" });
 * // "./dist/index.mjs"
 * ```
 */
function resolveExportFile(value: NpmExportsValue | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        return item;
      }
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const preferredKeys = [
    "browser",
    "import",
    "default",
    "production",
    "development",
    "node",
    "require",
  ] as const;

  for (const key of preferredKeys) {
    const nested = value[key];

    if (!nested) {
      continue;
    }

    const resolved = resolveExportFile(nested);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

/**
 * Resolves the best-effort default file path from npm package metadata.
 *
 * @remarks
 * The order favors CDN-specific fields first, then browser/module/main fields.
 * If no file is found, the resolver can still let jsDelivr resolve the package
 * root automatically.
 *
 * @param data npm package metadata.
 * @returns Best-effort file path, or null when the package does not declare one.
 *
 * @example
 * ```ts
 * resolveDefaultNpmFile({ module: "./dist/index.mjs", main: "./index.js" });
 * // "./dist/index.mjs"
 * ```
 */
function resolveDefaultNpmFile(data: NpmPackageResponse): string | null {
  if (data.jsdelivr) {
    return data.jsdelivr;
  }

  if (data.unpkg) {
    return data.unpkg;
  }

  if (typeof data.browser === "string") {
    return data.browser;
  }

  if (data.module) {
    return data.module;
  }

  const exportedFile = resolveExportFile(data.exports);

  if (exportedFile) {
    return exportedFile;
  }

  if (data.main) {
    return data.main;
  }

  if (data.browser && typeof data.browser === "object") {
    for (const candidate of Object.values(data.browser)) {
      if (typeof candidate === "string") {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Resolves the latest published version of an npm package.
 *
 * @remarks
 * The `/latest` registry endpoint returns version metadata, not the full package
 * packument. That means `dist-tags.latest` usually does not exist there. The
 * correct primary source for this endpoint is `version`.
 *
 * @param packageName npm package name.
 * @returns Latest version string and best-effort default file path.
 *
 * @example
 * ```ts
 * const latest = await resolveNpmLatest("es-toolkit");
 *
 * console.log(latest.version);
 * console.log(latest.file);
 * ```
 */
async function resolveNpmLatest(packageName: string): Promise<ResolvedNpmLatest> {
  const encodedPackageName = encodeNpmRegistryPackageName(packageName);
  const url = `${NPM_REGISTRY_BASE}/${encodedPackageName}/latest`;
  const response = await fetch(url, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`npm: failed to resolve ${packageName}: ${response.status}`);
  }

  const data = (await response.json()) as NpmPackageResponse;
  const version = data.version ?? data["dist-tags"]?.latest;

  if (!version) {
    throw new Error(
      `npm: could not resolve latest version for ${packageName}. The registry response did not include "version" or "dist-tags.latest".`,
    );
  }

  return {
    version,
    file: resolveDefaultNpmFile(data),
  };
}

/**
 * Builds a jsDelivr npm URL from package metadata.
 *
 * @remarks
 * When `file` is null, the URL points to the package root and lets jsDelivr
 * resolve the package entrypoint. This is useful for packages that do not expose
 * a clear `main`, `module`, `browser`, `unpkg`, or `jsdelivr` field.
 *
 * @param packageName npm package name.
 * @param version Concrete npm version.
 * @param file Optional package file path.
 * @returns Concrete jsDelivr URL.
 *
 * @example
 * ```ts
 * buildJsdelivrNpmUrl("es-toolkit", "1.39.3", "dist/index.js");
 * // "https://cdn.jsdelivr.net/npm/es-toolkit@1.39.3/dist/index.js"
 * ```
 */
function buildJsdelivrNpmUrl(packageName: string, version: string, file: string | null): string {
  const baseUrl = `${JSDELIVR_NPM_BASE}/${packageName}@${version}`;

  if (!file) {
    return baseUrl;
  }

  return `${baseUrl}/${normalizeCdnFilePath(file)}`;
}

/**
 * Resolves an npm asset spec via jsDelivr into a concrete URL and metadata.
 *
 * @param spec Parsed asset spec with provider "npm".
 * @returns Resolved asset ready for download.
 *
 * @example
 * ```ts
 * const asset = await resolveNpm({
 *   provider: "npm",
 *   packageName: "es-toolkit",
 *   version: "latest",
 *   file: null,
 *   options: {},
 * });
 *
 * console.log(asset.url);
 * ```
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

    if (!file) {
      warnings.push(
        `npm: no default file found for ${spec.packageName}@${version}; letting jsDelivr resolve the package root.`,
      );
    }
  }

  if (!version) {
    throw new Error(`npm: could not resolve version for ${spec.packageName}`);
  }

  const normalizedFile = file ? normalizeCdnFilePath(file) : null;
  const url = buildJsdelivrNpmUrl(spec.packageName, version, normalizedFile);

  return {
    provider: "npm",
    packageName: spec.packageName,
    version,
    file: normalizedFile,
    url,
    sourceLabel: normalizedFile
      ? `${spec.packageName}@${version}/${normalizedFile}`
      : `${spec.packageName}@${version}`,
    options: spec.options,
    warnings,
  };
}