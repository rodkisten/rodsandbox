import type { AssetProvider, BundleMode, CacheMode, OutputFormat, ParsedAssetSpec, RequestOptions, SpecOptions } from "./types";
import { FALSY, TRUTHY } from "./constants";

/**
 * Splits a comma-separated list without breaking commas inside option blocks.
 *
 * @param value Raw list value.
 * @returns Top-level comma-separated chunks.
 *
 * @example
 * splitTopLevel("lodash(n:_),gist:a/b/c.js(minify:false)");
 * // ["lodash(n:_)", "gist:a/b/c.js(minify:false)"]
 */
export function splitTopLevel(value: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) result.push(current.trim());
  return result;
}

/**
 * Validates path-ish DSL pieces before using them in remote URLs.
 *
 * @param value Value to validate.
 * @param label Human-readable label for errors.
 */
export function assertSafePath(value: string, label: string): void {
  if (!value || value.includes("..") || value.includes("\\") || value.includes("//")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  if (!/^[a-zA-Z0-9._@/+~-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

/**
 * Parses query boolean aliases.
 *
 * @param value Raw query value.
 * @param fallback Value used when the query is missing.
 * @returns Parsed boolean.
 */
export function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;

  const normalized = value.trim().toLowerCase();
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;

  throw new Error(`Invalid boolean value: ${value}`);
}

/**
 * Parses option blocks like `(n:GlobalLodash,minify:false)`.
 *
 * @param rawOptions Raw option block without surrounding parentheses.
 * @returns Parsed per-asset options.
 */
export function parseSpecOptions(rawOptions: string | null): SpecOptions {
  if (!rawOptions) return {};

  const entries = splitTopLevel(rawOptions);
  const options: Record<string, string | boolean> = {};

  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator === -1) {
      throw new Error(`Invalid option: ${entry}`);
    }

    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();

    if (!key || !value) {
      throw new Error(`Invalid option: ${entry}`);
    }

    const normalizedKey = key === "n" ? "name" : key === "remove-comments" ? "removeComments" : key;

    if (normalizedKey === "minify" || normalizedKey === "removeComments") {
      options[normalizedKey] = parseBoolean(value, true);
    } else {
      assertSafePath(value, normalizedKey);
      options[normalizedKey] = value;
    }
  }

  return options as SpecOptions;
}

/**
 * Removes and returns the final parenthesized option block from a spec.
 *
 * @param rawSpec Raw asset spec.
 * @returns Spec without options plus parsed options.
 */
export function peelOptions(rawSpec: string): { readonly spec: string; readonly options: SpecOptions } {
  const trimmed = rawSpec.trim();

  if (!trimmed.endsWith(")")) {
    return { spec: trimmed, options: {} };
  }

  let depth = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const char = trimmed[index];
    if (char === ")") depth += 1;
    if (char === "(") depth -= 1;

    if (depth === 0 && char === "(") {
      return {
        spec: trimmed.slice(0, index).trim(),
        options: parseSpecOptions(trimmed.slice(index + 1, -1)),
      };
    }
  }

  throw new Error(`Unclosed option block: ${rawSpec}`);
}

/**
 * Parses package, version and file pieces after provider prefixes are removed.
 *
 * @param raw Raw provider-local spec.
 * @returns Package name, optional version and optional file path.
 */
export function parsePackageVersionAndFile(raw: string): {
  readonly packageName: string;
  readonly version: string | null;
  readonly file: string | null;
} {
  const match = raw.match(/^(@[^/]+\/[^/@]+|[^/@/]+)(?:@([^/]+))?(?:\/(.+))?$/);

  if (!match) {
    throw new Error(`Invalid package spec: ${raw}`);
  }

  const packageName = match[1] ?? "";
  const version = match[2] ?? null;
  const file = match[3] ?? null;

  assertSafePath(packageName, "package");
  if (version) assertSafePath(version, "version");
  if (file) assertSafePath(file, "file");

  return { packageName, version, file };
}

/**
 * Parses a single compact asset spec.
 *
 * @param rawSpec Raw asset spec from `pkg`, `pkgs`, or a preset.
 * @returns Parsed asset spec.
 */
export function parseAssetSpec(rawSpec: string): ParsedAssetSpec {
  const { spec, options } = peelOptions(rawSpec);
  const providerSeparator = spec.indexOf(":");
  const explicitProvider = providerSeparator > 0 ? spec.slice(0, providerSeparator) : null;
  const body = providerSeparator > 0 ? spec.slice(providerSeparator + 1) : spec;

  const provider = (explicitProvider ?? options.provider ?? "auto") as AssetProvider;

  if (!["auto", "cdnjs", "npm", "gist"].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (provider === "gist") {
    const parts = body.split("/");
    if (parts.length < 3) {
      throw new Error(`Invalid gist spec: ${rawSpec}. Expected gist:owner/gistId/file.js`);
    }

    const [owner, gistId, ...fileParts] = parts;
    const file = fileParts.join("/");
    assertSafePath(owner, "gist owner");
    assertSafePath(gistId, "gist id");
    assertSafePath(file, "gist file");

    return {
      raw: rawSpec,
      provider,
      packageName: `${owner}/${gistId}`,
      version: "latest",
      file,
      options,
    };
  }

  const parsed = parsePackageVersionAndFile(body);

  return {
    raw: rawSpec,
    provider,
    packageName: parsed.packageName,
    version: parsed.version,
    file: parsed.file,
    options,
  };
}


/**
 * Parses the bundling mode while accepting friendly aliases used by userscripts.
 *
 * @param value Raw query value from `bundle`, `module`, or `bundle-format`.
 * @returns Normalized bundling mode.
 */
function parseBundleMode(value: string | null): BundleMode {
  if (!value) return "raw";

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return "iife";
  }

  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return "raw";
  }

  if (["raw", "iife", "esm", "cjs"].includes(normalized)) {
    return normalized as BundleMode;
  }

  throw new Error(`Invalid bundle mode: ${value}`);
}

/**
 * Parses the response format while allowing `format=iife` as a convenience alias
 * for users who think about module format rather than HTTP output format.
 *
 * @param value Raw query value.
 * @returns Output format when the value targets the HTTP response body.
 */
function parseOutputFormat(value: string | null): OutputFormat {
  if (!value) return "js";

  const normalized = value.trim().toLowerCase();

  if (["iife", "esm", "cjs"].includes(normalized)) {
    return "js";
  }

  if (["js", "text", "json"].includes(normalized)) {
    return normalized as OutputFormat;
  }

  throw new Error(`Invalid format: ${value}`);
}

/**
 * Parses module format from the dedicated bundle params or from `format=iife`.
 *
 * @param params Request search params.
 * @returns Normalized bundle mode.
 */
function parseRequestedBundleMode(params: URLSearchParams): BundleMode {
  const explicit = params.get("bundle-format") ?? params.get("module");

  if (explicit) {
    return parseBundleMode(explicit);
  }

  const format = params.get("format") ?? params.get("as");

  if (format && ["iife", "esm", "cjs"].includes(format.trim().toLowerCase())) {
    return parseBundleMode(format);
  }

  return parseBundleMode(params.get("bundle"));
}

/**
 * Parses a comma-separated external package list.
 *
 * @param value Raw query value.
 * @returns External package names.
 */
function parseExternalPackages(value: string | null): readonly string[] {
  if (!value) return [];

  return splitTopLevel(value).map((item) => item.trim()).filter(Boolean);
}

function parseEnum<T extends string>(value: string | null, fallback: T, allowed: readonly T[], label: string): T {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase() as T;
  if (allowed.includes(normalized)) return normalized;
  throw new Error(`Invalid ${label}: ${value}`);
}

/**
 * Parses the complete request query contract.
 *
 * @param urlSearchParams Request search params.
 * @returns Fully parsed route options.
 */
export function parseRequestOptions(urlSearchParams: URLSearchParams): RequestOptions {
  const rawPkgValues = [
    ...urlSearchParams.getAll("pkg"),
    ...urlSearchParams.getAll("pkgs").flatMap(splitTopLevel),
    ...urlSearchParams.getAll("packages").flatMap(splitTopLevel),
    ...urlSearchParams.getAll("libs").flatMap(splitTopLevel),
  ];

  const specs = rawPkgValues.filter(Boolean).map(parseAssetSpec);
  const presets = urlSearchParams
    .getAll("preset")
    .flatMap(splitTopLevel)
    .map((preset) => preset.trim().toLowerCase())
    .filter(Boolean);

  const minify = parseBoolean(urlSearchParams.get("minify") ?? urlSearchParams.get("min"), true);
  const removeComments = parseBoolean(urlSearchParams.get("remove-comments") ?? urlSearchParams.get("comments"), false);

  const globalName = urlSearchParams.get("global") ?? urlSearchParams.get("name") ?? null;
  const entry = urlSearchParams.get("entry") ?? null;

  if (globalName) {
    assertSafePath(globalName, "global");
  }

  if (entry) {
    assertSafePath(entry, "entry");
  }

  return {
    specs,
    presets,
    minify,
    removeComments,
    cacheMode: parseEnum(urlSearchParams.get("cache"), "immutable", ["none", "short", "normal", "long", "immutable"], "cache") as CacheMode,
    format: parseOutputFormat(urlSearchParams.get("format") ?? urlSearchParams.get("as")),
    bundleMode: parseRequestedBundleMode(urlSearchParams),
    combine: parseBoolean(urlSearchParams.get("combine"), true),
    debug: parseBoolean(urlSearchParams.get("debug"), false),
    globalName,
    entry,
    platform: parseEnum(urlSearchParams.get("platform"), "browser", ["browser", "node"], "platform"),
    external: parseExternalPackages(urlSearchParams.get("external")),
    bundleProvider: parseEnum(urlSearchParams.get("bundle-provider") ?? urlSearchParams.get("provider"), "esm.sh", ["esm.sh", "jsdelivr"], "bundle-provider"),
  };
}
