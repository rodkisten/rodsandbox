import { JSDELIVR_NPM_BASE, NPM_REGISTRY_BASE } from "../constants";
import type { ParsedAssetSpec, ResolvedAsset } from "../types";

/***************************************************************************************************
 * Constants
 **************************************************************************************************/

const EXPORT_CONDITIONS = [
  "browser",
  "import",
  "require",
  "node",
  "production",
  "development",
  "default",
] as const;

const ROOT_EXPORT_KEYS = [".", "./"] as const;

/***************************************************************************************************
 * Types
 **************************************************************************************************/

type NpmDistTags = {
  readonly latest?: string;
};

type NpmExportsCondition = (typeof EXPORT_CONDITIONS)[number];

type NpmExportsValue = string | null | false | readonly NpmExportsValue[] | NpmExportsObject;

interface NpmExportsObject {
  readonly [key: string]: NpmExportsValue | undefined;
  readonly browser?: NpmExportsValue;
  readonly import?: NpmExportsValue;
  readonly require?: NpmExportsValue;
  readonly default?: NpmExportsValue;
  readonly development?: NpmExportsValue;
  readonly production?: NpmExportsValue;
  readonly node?: NpmExportsValue;
  readonly types?: NpmExportsValue;
}

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
  readonly file: string;
};

/***************************************************************************************************
 * Type Guards
 **************************************************************************************************/

/**
 * Checks whether an npm exports value is an object map that can be safely indexed.
 *
 * @param value Candidate npm exports value.
 * @returns True when the value is a non-null object and not an array.
 *
 * @example
 * ```ts
 * isNpmExportsObject({ import: "./dist/index.mjs" });
 * // true
 *
 * isNpmExportsObject(["./dist/index.js"]);
 * // false
 * ```
 */
function isNpmExportsObject(value: NpmExportsValue | undefined): value is NpmExportsObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks whether an object owns a specific export key.
 *
 * @param value npm exports object.
 * @param key Export key to check.
 * @returns True when the key exists directly on the object.
 *
 * @example
 * ```ts
 * hasOwnExportKey({ ".": "./index.js" }, ".");
 * // true
 * ```
 */
function hasOwnExportKey(value: NpmExportsObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/***************************************************************************************************
 * Path Helpers
 **************************************************************************************************/

/**
 * Encodes an npm package name for registry requests.
 *
 * @remarks
 * npm accepts scoped packages as `@scope%2Fname`. Keeping `@` readable makes
 * logs and errors easier to inspect while still safely encoding `/`.
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
 * Removes leading slashes and package-root prefixes from a CDN file path.
 *
 * @param file Candidate file path.
 * @returns Normalized relative file path.
 *
 * @example
 * ```ts
 * normalizeCdnFilePath("./dist/index.js");
 * // "dist/index.js"
 *
 * normalizeCdnFilePath("/dist/index.js");
 * // "dist/index.js"
 * ```
 */
function normalizeCdnFilePath(file: string): string {
  return file.replace(/^\.\/+/, "").replace(/^\/+/, "");
}

/***************************************************************************************************
 * npm exports Resolution
 **************************************************************************************************/

/**
 * Resolves the first string file target from an npm exports value.
 *
 * @param value npm exports value.
 * @returns Best-effort file path, or an empty string when no safe file path is found.
 *
 * @example
 * ```ts
 * resolveExportFile({ import: "./dist/index.mjs" });
 * // "./dist/index.mjs"
 *
 * resolveExportFile({ ".": { browser: "./dist/browser.js" } });
 * // "./dist/browser.js"
 * ```
 */
function resolveExportFile(value: NpmExportsValue | undefined): string {
  if (value === undefined || value === null || value === false) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveExportFile(item);

      if (resolved) {
        return resolved;
      }
    }

    return "";
  }

  if (!isNpmExportsObject(value)) {
    return "";
  }

  for (const rootKey of ROOT_EXPORT_KEYS) {
    if (!hasOwnExportKey(value, rootKey)) {
      continue;
    }

    const resolved = resolveExportFile(value[rootKey]);

    if (resolved) {
      return resolved;
    }
  }

  for (const condition of EXPORT_CONDITIONS) {
    const nested = value[condition];

    if (nested === undefined) {
      continue;
    }

    const resolved = resolveExportFile(nested);

    if (resolved) {
      return resolved;
    }
  }

  for (const nested of Object.values(value)) {
    const resolved = resolveExportFile(nested);

    if (resolved) {
      return resolved;
    }
  }

  return "";
}

/**
 * Resolves the best-effort default file path from npm package metadata.
 *
 * @param data npm package metadata.
 * @returns Best-effort file path, or an empty string when the package does not declare one.
 *
 * @example
 * ```ts
 * resolveDefaultNpmFile({ module: "./dist/index.mjs", main: "./index.js" });
 * // "./dist/index.mjs"
 * ```
 */
function resolveDefaultNpmFile(data: NpmPackageResponse): string {
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

  return "";
}

/***************************************************************************************************
 * Registry Resolution
 **************************************************************************************************/

/**
 * Resolves the latest published version of an npm package.
 *
 * @remarks
 * The `/latest` registry endpoint returns version metadata, not the full
 * package packument. The primary source here is therefore `version`, with
 * `dist-tags.latest` kept only as a defensive fallback.
 *
 * @param packageName npm package name.
 * @returns Latest version and best-effort default file path.
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

/***************************************************************************************************
 * URL Builder
 **************************************************************************************************/

/**
 * Builds a jsDelivr npm URL from package metadata.
 *
 * @remarks
 * When `file` is an empty string, the URL points to the package root and lets
 * jsDelivr resolve the package entrypoint.
 *
 * @param packageName npm package name.
 * @param version Concrete npm version.
 * @param file Optional package file path. Use an empty string for package root.
 * @returns Concrete jsDelivr URL.
 *
 * @example
 * ```ts
 * buildJsdelivrNpmUrl("es-toolkit", "1.39.3", "dist/index.js");
 * // "https://cdn.jsdelivr.net/npm/es-toolkit@1.39.3/dist/index.js"
 *
 * buildJsdelivrNpmUrl("es-toolkit", "1.39.3", "");
 * // "https://cdn.jsdelivr.net/npm/es-toolkit@1.39.3"
 * ```
 */
function buildJsdelivrNpmUrl(packageName: string, version: string, file: string): string {
  const baseUrl = `${JSDELIVR_NPM_BASE}/${packageName}@${version}`;

  if (!file) {
    return baseUrl;
  }

  return `${baseUrl}/${normalizeCdnFilePath(file)}`;
}

/***************************************************************************************************
 * Public API
 **************************************************************************************************/

/**
 * Resolves an npm asset spec via jsDelivr into a concrete URL and metadata.
 *
 * @param spec Parsed asset spec with provider `npm`.
 * @returns Resolved asset ready for download.
 *
 * @example
 * ```ts
 * const asset = await resolveNpm({
 *   provider: "npm",
 *   packageName: "es-toolkit",
 *   version: "latest",
 *   file: "",
 *   options: {},
 * });
 *
 * console.log(asset.url);
 * ```
 */
export async function resolveNpm(spec: ParsedAssetSpec): Promise<ResolvedAsset> {
  const warnings: string[] = [];
  let { version } = spec;
  let file = spec.file ?? "";

  if (!version || version === "latest" || !file) {
    const latest = await resolveNpmLatest(spec.packageName);

    if (!version || version === "latest") {
      version = latest.version;
      warnings.push(`npm: resolved latest version for ${spec.packageName}: ${version}`);
    }

    file = file || latest.file;

    if (!file) {
      warnings.push(
        `npm: no default file found for ${spec.packageName}@${version}; letting jsDelivr resolve the package root.`,
      );
    }
  }

  if (!version) {
    throw new Error(`npm: could not resolve version for ${spec.packageName}`);
  }

  const normalizedFile = file ? normalizeCdnFilePath(file) : "";
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
