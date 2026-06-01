import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CDNJS_API_BASE = "https://api.cdnjs.com/libraries";
const CDNJS_ASSET_BASE = "https://cdnjs.cloudflare.com/ajax/libs";
const CACHE_DIR = path.join(process.cwd(), ".next", "cache", "rod-cdn-proxy");

const CACHE_SECONDS = {
  none: 0,
  short: 60 * 5,
  normal: 60 * 60,
  long: 60 * 60 * 24 * 7,
  immutable: 60 * 60 * 24 * 365,
} as const;

const FORMAT_ALIASES = {
  js: "js",
  text: "text",
  json: "json",
} as const;

const MINIFY_ALIASES = new Set(["1", "true", "yes", "on"]);
const NO_MINIFY_ALIASES = new Set(["0", "false", "no", "off"]);

type CacheMode = keyof typeof CACHE_SECONDS;
type OutputFormat = keyof typeof FORMAT_ALIASES;

type CdnjsLibraryMetadata = {
  name: string;
  version: string;
  filename: string;
  latest?: string;
};

type CdnjsVersionMetadata = {
  name: string;
  version: string;
  files: string[];
};

type ParsedPackageSpec = {
  packageName: string;
  requestedVersion: string | null;
  requestedFile: string | null;
  raw: string;
};

type ResolvedAsset = {
  packageName: string;
  version: string;
  file: string;
  url: string;
};

type RequestOptions = {
  packages: ParsedPackageSpec[];
  minify: boolean;
  cacheMode: CacheMode;
  format: OutputFormat;
};

/**
 * Parses a package spec from the compact query API.
 *
 * Supported forms:
 *
 * @example
 * ```ts
 * parsePackageSpec("jquery");
 * // { packageName: "jquery", requestedVersion: null, requestedFile: null }
 * ```
 *
 * @example
 * ```ts
 * parsePackageSpec("jquery@3.7.1");
 * // { packageName: "jquery", requestedVersion: "3.7.1", requestedFile: null }
 * ```
 *
 * @example
 * ```ts
 * parsePackageSpec("highlight.js@11.11.1/languages/javascript.min.js");
 * // {
 * //   packageName: "highlight.js",
 * //   requestedVersion: "11.11.1",
 * //   requestedFile: "languages/javascript.min.js"
 * // }
 * ```
 *
 * @param rawSpec Raw package spec from the `pkgs` query param.
 * @returns Parsed package request.
 */
function parsePackageSpec(rawSpec: string): ParsedPackageSpec {
  const raw = rawSpec.trim();

  if (!raw) {
    throw new Error("Empty package spec received.");
  }

  const slashIndex = raw.indexOf("/");
  const packageAndVersion = slashIndex === -1 ? raw : raw.slice(0, slashIndex);
  const requestedFile = slashIndex === -1 ? null : raw.slice(slashIndex + 1);

  const versionSeparatorIndex = packageAndVersion.lastIndexOf("@");
  const hasVersion =
    versionSeparatorIndex > 0 &&
    versionSeparatorIndex < packageAndVersion.length - 1;

  const packageName = hasVersion
    ? packageAndVersion.slice(0, versionSeparatorIndex)
    : packageAndVersion;

  const requestedVersion = hasVersion
    ? packageAndVersion.slice(versionSeparatorIndex + 1)
    : null;

  assertSafePathPart(packageName, "package");
  assertSafePathPart(requestedVersion ?? "latest", "version");

  if (requestedFile) {
    assertSafeFilePath(requestedFile);
  }

  return {
    packageName,
    requestedVersion,
    requestedFile,
    raw,
  };
}

/**
 * Validates package and version parts before they are used in URLs or cache keys.
 *
 * @param value Input value.
 * @param label Human-readable label for errors.
 * @returns Nothing.
 */
function assertSafePathPart(value: string, label: string): void {
  if (!value || value.includes("..") || value.includes("\\") || value.includes("//")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  if (!/^[a-zA-Z0-9._@+~-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

/**
 * Validates a cdnjs file path while still allowing nested language/plugin assets.
 *
 * @param value Asset file path.
 * @returns Nothing.
 */
function assertSafeFilePath(value: string): void {
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("//")
  ) {
    throw new Error(`Invalid file path: ${value}`);
  }

  if (!/^[a-zA-Z0-9._@/+~-]+$/.test(value)) {
    throw new Error(`Invalid file path: ${value}`);
  }
}

/**
 * Reads request aliases and turns them into strongly typed options.
 *
 * @example
 * ```txt
 * /api/cdn?pkgs=jquery&minify=false&cache=short&format=text
 * ```
 *
 * @param request Incoming Next.js request.
 * @returns Parsed request options.
 */
function parseRequestOptions(request: NextRequest): RequestOptions {
  const params = request.nextUrl.searchParams;

  const rawPackages =
    params.get("pkgs") ??
    params.get("packages") ??
    params.get("libs") ??
    params.get("scripts");

  if (!rawPackages) {
    throw new Error("Missing query param: pkgs");
  }

  const packages = rawPackages
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parsePackageSpec);

  if (packages.length === 0) {
    throw new Error("No packages found in query param: pkgs");
  }

  const rawMinify = params.get("minify") ?? params.get("min") ?? "true";
  const minify = parseMinifyAlias(rawMinify);

  const rawCache = params.get("cache") ?? "immutable";
  const cacheMode = parseCacheMode(rawCache);

  const rawFormat = params.get("format") ?? params.get("as") ?? "js";
  const format = parseFormat(rawFormat);

  return {
    packages,
    minify,
    cacheMode,
    format,
  };
}

/**
 * Parses minify aliases.
 *
 * @param value Raw query value.
 * @returns Whether minification should run.
 */
function parseMinifyAlias(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (MINIFY_ALIASES.has(normalized)) {
    return true;
  }

  if (NO_MINIFY_ALIASES.has(normalized)) {
    return false;
  }

  throw new Error(`Invalid minify value: ${value}`);
}

/**
 * Parses cache aliases.
 *
 * Supported values: none, short, normal, long, immutable.
 *
 * @param value Raw query value.
 * @returns Cache mode.
 */
function parseCacheMode(value: string): CacheMode {
  const normalized = value.trim().toLowerCase();

  if (normalized in CACHE_SECONDS) {
    return normalized as CacheMode;
  }

  throw new Error(`Invalid cache value: ${value}`);
}

/**
 * Parses output format aliases.
 *
 * Supported values: js, text, json.
 *
 * @param value Raw query value.
 * @returns Output format.
 */
function parseFormat(value: string): OutputFormat {
  const normalized = value.trim().toLowerCase();

  if (normalized in FORMAT_ALIASES) {
    return normalized as OutputFormat;
  }

  throw new Error(`Invalid format value: ${value}`);
}

/**
 * Fetches cdnjs package metadata. This is used for latest-version resolution
 * and for detecting the package main file when the user does not pass one.
 *
 * @param packageName cdnjs package name.
 * @returns cdnjs library metadata.
 */
async function fetchLibraryMetadata(
  packageName: string,
): Promise<CdnjsLibraryMetadata> {
  const url = `${CDNJS_API_BASE}/${encodeURIComponent(
    packageName,
  )}?fields=name,version,filename,latest`;

  const response = await fetch(url, {
    next: {
      revalidate: CACHE_SECONDS.long,
    },
  });

  if (!response.ok) {
    throw new Error(`Package not found on cdnjs: ${packageName}`);
  }

  return response.json();
}

/**
 * Fetches metadata for a specific package version so requested files can be
 * validated before downloading.
 *
 * @param packageName cdnjs package name.
 * @param version Resolved version.
 * @returns cdnjs version metadata.
 */
async function fetchVersionMetadata(
  packageName: string,
  version: string,
): Promise<CdnjsVersionMetadata> {
  const url = `${CDNJS_API_BASE}/${encodeURIComponent(
    packageName,
  )}/${encodeURIComponent(version)}?fields=name,version,files`;

  const response = await fetch(url, {
    next: {
      revalidate: CACHE_SECONDS.long,
    },
  });

  if (!response.ok) {
    throw new Error(`Version not found on cdnjs: ${packageName}@${version}`);
  }

  return response.json();
}

/**
 * Resolves compact package specs into concrete cdnjs asset URLs.
 *
 * @param packages Parsed package specs.
 * @returns Ordered list of assets.
 */
async function resolveAssets(packages: ParsedPackageSpec[]): Promise<ResolvedAsset[]> {
  const assets: ResolvedAsset[] = [];

  for (const item of packages) {
    const library = await fetchLibraryMetadata(item.packageName);
    const version =
      !item.requestedVersion || item.requestedVersion === "latest"
        ? library.version
        : item.requestedVersion;

    const versionMetadata = await fetchVersionMetadata(item.packageName, version);
    const availableFiles = new Set(versionMetadata.files);
    const file = item.requestedFile ?? library.filename;

    if (!file) {
      throw new Error(`No default file found for package: ${item.packageName}`);
    }

    if (!availableFiles.has(file)) {
      throw new Error(
        `Asset not found: ${item.packageName}@${version}/${file}`,
      );
    }

    assets.push({
      packageName: item.packageName,
      version,
      file,
      url: `${CDNJS_ASSET_BASE}/${item.packageName}/${version}/${file}`,
    });
  }

  return assets;
}

/**
 * Creates a stable cache key for the full request shape.
 *
 * @param options Request options.
 * @param assets Resolved assets.
 * @returns Stable SHA-256 cache key.
 */
function createCacheKey(options: RequestOptions, assets: ResolvedAsset[]): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        assets,
        minify: options.minify,
        format: options.format,
      }),
    )
    .digest("hex");
}

/**
 * Downloads every asset in order and returns a single bundle string.
 *
 * @param assets Ordered cdnjs assets.
 * @returns Raw concatenated JavaScript.
 */
async function downloadBundle(assets: ResolvedAsset[]): Promise<string> {
  const chunks: string[] = [];

  for (const asset of assets) {
    const response = await fetch(asset.url, {
      cache: "force-cache",
    });

    if (!response.ok) {
      throw new Error(`Failed to download asset: ${asset.url}`);
    }

    const source = await response.text();

    chunks.push(
      [
        `;`,
        `/*`,
        ` * ${asset.packageName}@${asset.version}/${asset.file}`,
        ` * ${asset.url}`,
        ` */`,
        source,
      ].join("\n"),
    );
  }

  return chunks.join("\n");
}

/**
 * Minifies JavaScript once before saving it to disk.
 *
 * @param source Raw JavaScript bundle.
 * @param shouldMinify Whether minification should run.
 * @returns Final JavaScript bundle.
 */
async function buildBundle(source: string, shouldMinify: boolean): Promise<string> {
  if (!shouldMinify) {
    return source;
  }
  
  const esbuild = await import("esbuild");
  const result = await esbuild.transform(source, {
    loader: "js",
    minify: true,
    legalComments: "none",
    target: "es2018",
  });

  return result.code;
}

/**
 * Reads a cached bundle or creates it on the first request.
 *
 * @param cacheKey Stable cache key.
 * @param assets Ordered cdnjs assets.
 * @param shouldMinify Whether minification should run.
 * @returns Cached or freshly built bundle.
 */
async function readOrCreateCachedBundle(
  cacheKey: string,
  assets: ResolvedAsset[],
  shouldMinify: boolean,
): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });

  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.js`);

  try {
    return await readFile(cacheFile, "utf8");
  } catch {
    const rawBundle = await downloadBundle(assets);
    const builtBundle = await buildBundle(rawBundle, shouldMinify);

    await writeFile(cacheFile, builtBundle, "utf8");

    return builtBundle;
  }
}

/**
 * Creates cache headers for browser, shared CDN and Vercel CDN caches.
 *
 * @param cacheMode Cache mode alias.
 * @returns Cache headers.
 */
function createCacheHeaders(cacheMode: CacheMode): Record<string, string> {
  const seconds = CACHE_SECONDS[cacheMode];

  if (seconds === 0) {
    return {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    };
  }

  const immutable = cacheMode === "immutable" ? ", immutable" : "";

  return {
    "Cache-Control": `public, max-age=${seconds}, s-maxage=${seconds}${immutable}`,
    "CDN-Cache-Control": `public, max-age=${seconds}`,
    "Vercel-CDN-Cache-Control": `public, max-age=${seconds}`,
  };
}

/**
 * Returns the requested response format.
 *
 * @param options Parsed request options.
 * @param assets Resolved assets.
 * @param code Bundle code.
 * @returns Next.js response.
 */
function createFormattedResponse(
  options: RequestOptions,
  assets: ResolvedAsset[],
  code: string,
): NextResponse {
  const cacheHeaders = createCacheHeaders(options.cacheMode);

  if (options.format === "json") {
    return NextResponse.json(
      {
        assets,
        minify: options.minify,
        cache: options.cacheMode,
        code,
      },
      {
        headers: cacheHeaders,
      },
    );
  }

  const contentType =
    options.format === "text"
      ? "text/plain; charset=utf-8"
      : "application/javascript; charset=utf-8";

  return new NextResponse(code, {
    status: 200,
    headers: {
      ...cacheHeaders,
      "Content-Type": contentType,
      "X-Rod-CDN-Assets": assets
        .map((asset) => `${asset.packageName}@${asset.version}/${asset.file}`)
        .join(","),
      "X-Rod-CDN-Minified": String(options.minify),
      "X-Rod-CDN-Cache": options.cacheMode,
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const options = parseRequestOptions(request);
    const assets = await resolveAssets(options.packages);
    const cacheKey = createCacheKey(options, assets);

    const code = await readOrCreateCachedBundle(
      cacheKey,
      assets,
      options.minify,
    );

    return createFormattedResponse(options, assets, code);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
