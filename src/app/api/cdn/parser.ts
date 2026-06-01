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
  const atIndex = raw.lastIndexOf("@");
  const slashAfterVersion = atIndex > 0 ? raw.indexOf("/", atIndex) : -1;

  if (atIndex > 0) {
    const packageName = raw.slice(0, atIndex);
    const version = slashAfterVersion === -1 ? raw.slice(atIndex + 1) : raw.slice(atIndex + 1, slashAfterVersion);
    const file = slashAfterVersion === -1 ? null : raw.slice(slashAfterVersion + 1);

    assertSafePath(packageName, "package");
    assertSafePath(version, "version");
    if (file) assertSafePath(file, "file");

    return { packageName, version, file };
  }

  const slashIndex = raw.indexOf("/");
  const packageName = slashIndex === -1 ? raw : raw.slice(0, slashIndex);
  const file = slashIndex === -1 ? null : raw.slice(slashIndex + 1);

  assertSafePath(packageName, "package");
  if (file) assertSafePath(file, "file");

  return { packageName, version: null, file };
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

  const provider = (explicitProvider ?? options.provider ?? "cdnjs") as AssetProvider;

  if (!["cdnjs", "npm", "gist"].includes(provider)) {
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
  const removeComments = parseBoolean(urlSearchParams.get("remove-comments") ?? urlSearchParams.get("comments"), true);

  return {
    specs,
    presets,
    minify,
    removeComments,
    cacheMode: parseEnum(urlSearchParams.get("cache"), "immutable", ["none", "short", "normal", "long", "immutable"], "cache") as CacheMode,
    format: parseEnum(urlSearchParams.get("format") ?? urlSearchParams.get("as"), "js", ["js", "text", "json"], "format") as OutputFormat,
    bundleMode: parseEnum(urlSearchParams.get("bundle"), "raw", ["raw", "iife"], "bundle") as BundleMode,
    combine: parseBoolean(urlSearchParams.get("combine"), true),
    debug: parseBoolean(urlSearchParams.get("debug"), false),
  };
}
