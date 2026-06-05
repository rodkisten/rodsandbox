import { GITHUB_API_BASE, GITHUB_RAW_CONTENT_BASE, JSDELIVR_GITHUB_BASE } from "../constants";
import type { ParsedAssetSpec, ResolvedAsset } from "../types";

/***************************************************************************************************
 * Constants
 **************************************************************************************************/

const DEFAULT_GITHUB_REF = "main";
const DEFAULT_FOLDER_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);

/***************************************************************************************************
 * Types
 **************************************************************************************************/

type GitHubLocation = {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly path: string;
  readonly isFolder: boolean;
};

type GitHubTreeItem = {
  readonly path?: string;
  readonly type?: string;
};

type GitHubTreeResponse = {
  readonly tree?: readonly GitHubTreeItem[];
  readonly truncated?: boolean;
};

/***************************************************************************************************
 * Small Helpers
 **************************************************************************************************/

/**
 * Converts unknown errors to readable messages.
 *
 * @param error Unknown caught error.
 * @returns Human-readable error message.
 */
function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown GitHub provider error";
}

/**
 * Returns a GitHub token when one is configured for private repositories.
 *
 * @returns GitHub token or an empty string.
 */
function readGitHubToken(): string {
  return process.env["GITHUB_TOKEN"] ?? process.env["GIST_TOKEN"] ?? "";
}

/**
 * Creates GitHub API headers with optional private-repository auth.
 *
 * @returns Headers for GitHub API calls.
 */
function createGitHubHeaders(): Record<string, string> {
  const token = readGitHubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Gets a lower-case file extension from a path.
 *
 * @param filePath Path to inspect.
 * @returns Extension including the dot, or an empty string.
 */
function getExtension(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  const lastDot = filePath.lastIndexOf(".");

  if (lastDot <= lastSlash) {
    return "";
  }

  return filePath.slice(lastDot).toLowerCase();
}

/**
 * Parses the optional `ext` spec option used by GitHub folder imports.
 *
 * @remarks
 * The DSL accepts a compact value like `ext:css` or `ext:js+mjs+cjs`. Commas are intentionally not
 * used because commas already separate top-level package specs.
 *
 * @param value Extension option value.
 * @returns Allowed extensions.
 */
function parseExtensionFilter(value: string | undefined): Set<string> {
  if (!value) {
    return new Set(DEFAULT_FOLDER_EXTENSIONS);
  }

  return new Set(
    value
      .split("+")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .map((item) => (item.startsWith(".") ? item : `.${item}`)),
  );
}

/**
 * Builds a raw GitHub URL that works with private repositories only when GitHub allows token-bearing
 * fetches in the current runtime. Public files also work through this URL directly.
 *
 * @param location GitHub location.
 * @returns Raw GitHub URL.
 */
function buildRawGitHubUrl(location: GitHubLocation): string {
  return `${GITHUB_RAW_CONTENT_BASE}/${location.owner}/${location.repo}/${location.ref}/${location.path}`;
}

/**
 * Builds a jsDelivr GitHub URL for public repositories.
 *
 * @param location GitHub location.
 * @returns jsDelivr GitHub URL.
 */
function buildJsdelivrGitHubUrl(location: GitHubLocation): string {
  return `${JSDELIVR_GITHUB_BASE}/${location.owner}/${location.repo}@${location.ref}/${location.path}`;
}

/***************************************************************************************************
 * Location Parsing
 **************************************************************************************************/

/**
 * Parses a github.com or raw.githubusercontent.com URL into a GitHub location.
 *
 * @param url Direct GitHub URL.
 * @returns Parsed GitHub location.
 */
function parseGitHubUrl(url: URL): GitHubLocation {
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.hostname === "raw.githubusercontent.com") {
    const [owner, repo, ref, ...pathParts] = parts;

    if (!owner || !repo || !ref || pathParts.length === 0) {
      throw new Error(`Invalid raw GitHub URL: ${url.toString()}`);
    }

    return {
      owner,
      repo,
      ref,
      path: pathParts.join("/"),
      isFolder: false,
    };
  }

  if (url.hostname !== "github.com") {
    throw new Error(`Unsupported GitHub host: ${url.hostname}`);
  }

  const [owner, repo, kind, ref, ...pathParts] = parts;

  if (!owner || !repo || !kind || !ref) {
    throw new Error(`Invalid GitHub URL: ${url.toString()}`);
  }

  if (kind !== "blob" && kind !== "tree") {
    throw new Error(`Unsupported GitHub URL kind: ${kind}. Use /blob/ for files or /tree/ for folders.`);
  }

  return {
    owner,
    repo,
    ref,
    path: pathParts.join("/"),
    isFolder: kind === "tree",
  };
}

/**
 * Parses the compact `github:owner/repo@ref/path` DSL into a GitHub location.
 *
 * @param spec Parsed GitHub spec.
 * @returns Parsed GitHub location.
 */
function parseGitHubDsl(spec: ParsedAssetSpec): GitHubLocation {
  const [owner, repo] = spec.packageName.split("/");
  const ref = spec.version || DEFAULT_GITHUB_REF;
  const filePath = spec.file ?? "";
  const isFolder = !filePath || !getExtension(filePath);

  if (!owner || !repo) {
    throw new Error(`Invalid GitHub spec: ${spec.raw}`);
  }

  return {
    owner,
    repo,
    ref,
    path: filePath,
    isFolder,
  };
}

/**
 * Parses any GitHub spec shape into a GitHub location.
 *
 * @param spec Parsed GitHub spec.
 * @returns Parsed GitHub location.
 */
function parseGitHubLocation(spec: ParsedAssetSpec): GitHubLocation {
  if (spec.packageName.startsWith("http://") || spec.packageName.startsWith("https://")) {
    return parseGitHubUrl(new URL(spec.packageName));
  }

  return parseGitHubDsl(spec);
}

/***************************************************************************************************
 * Folder Resolution
 **************************************************************************************************/

/**
 * Reads a GitHub tree recursively using the API.
 *
 * @param location GitHub repository location.
 * @returns GitHub tree items.
 */
async function readGitHubTree(location: GitHubLocation): Promise<readonly GitHubTreeItem[]> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/git/trees/${encodeURIComponent(location.ref)}?recursive=1`;
  const response = await fetch(url, {
    headers: createGitHubHeaders(),
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`github: failed to read tree ${location.owner}/${location.repo}@${location.ref}: ${response.status}`);
  }

  const data = (await response.json()) as GitHubTreeResponse;

  return data.tree ?? [];
}

/**
 * Resolves a GitHub folder into deterministic file assets.
 *
 * @param spec Parsed GitHub spec.
 * @param location Folder location.
 * @returns Resolved file assets inside the folder.
 */
async function resolveGitHubFolder(spec: ParsedAssetSpec, location: GitHubLocation): Promise<readonly ResolvedAsset[]> {
  const tree = await readGitHubTree(location);
  const prefix = location.path ? `${location.path.replace(/\/+$/, "")}/` : "";
  const extensions = parseExtensionFilter(spec.options.ext);
  const warnings: string[] = [
    `github: resolved folder ${location.owner}/${location.repo}@${location.ref}/${location.path || ""} with extensions ${Array.from(extensions).join(",")}`,
  ];

  const files = tree
    .filter((item) => item.type === "blob" && item.path)
    .map((item) => item.path!)
    .filter((filePath) => filePath.startsWith(prefix))
    .filter((filePath) => extensions.has(getExtension(filePath)))
    .sort();

  if (files.length === 0) {
    throw new Error(`github: no matching files found in ${location.owner}/${location.repo}@${location.ref}/${location.path || ""}`);
  }

  return files.map((filePath) => {
    const fileLocation = { ...location, path: filePath, isFolder: false };
    const useRaw = Boolean(readGitHubToken());
    const url = useRaw ? buildRawGitHubUrl(fileLocation) : buildJsdelivrGitHubUrl(fileLocation);

    return {
      provider: "github" as const,
      packageName: `${location.owner}/${location.repo}`,
      version: location.ref,
      file: filePath,
      url,
      sourceLabel: `github:${location.owner}/${location.repo}@${location.ref}/${filePath}`,
      options: spec.options,
      warnings,
    };
  });
}

/***************************************************************************************************
 * Public API
 **************************************************************************************************/

/**
 * Resolves GitHub file or folder specs into download-ready assets.
 *
 * @remarks
 * Supported inputs include direct GitHub URLs, raw GitHub URLs and the compact DSL:
 * `github:owner/repo@main/path/to/file.js`. Folder imports use GitHub's tree API and default to
 * JavaScript-like files. Add `(ext:css)` or `(ext:js+mjs+cjs+css)` for custom folder filters.
 *
 * @param spec Parsed GitHub spec.
 * @returns One resolved file asset or many assets when the spec points to a folder.
 */
export async function resolveGitHub(spec: ParsedAssetSpec): Promise<ResolvedAsset | readonly ResolvedAsset[]> {
  try {
    const location = parseGitHubLocation(spec);

    if (location.isFolder) {
      return resolveGitHubFolder(spec, location);
    }

    const useRaw = Boolean(readGitHubToken());
    const url = useRaw ? buildRawGitHubUrl(location) : buildJsdelivrGitHubUrl(location);

    return {
      provider: "github",
      packageName: `${location.owner}/${location.repo}`,
      version: location.ref,
      file: location.path,
      url,
      sourceLabel: `github:${location.owner}/${location.repo}@${location.ref}/${location.path}`,
      options: spec.options,
      warnings: useRaw ? ["github: using raw.githubusercontent.com because a GitHub token is configured."] : ["github: using jsDelivr GitHub CDN for public file delivery."],
    };
  } catch (error) {
    throw new Error(`github: ${stringifyError(error)}`);
  }
}
