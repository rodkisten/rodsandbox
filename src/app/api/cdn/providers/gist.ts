import { GITHUB_API_BASE, GITHUB_RAW_GIST_BASE } from "../constants";
import type { ParsedAssetSpec, ResolvedAsset } from "../types";

type GistFile = {
  readonly filename: string;
  readonly raw_url: string;
};

type GistResponse = {
  readonly files: Record<string, GistFile>;
};

/**
 * Resolves a GitHub Gist raw URL via the Gist API.
 * Falls back to the predictable raw URL if the API call fails.
 *
 * @param owner Gist owner username.
 * @param gistId Gist ID.
 * @param file File name within the gist.
 * @returns Raw download URL.
 */
async function resolveGistUrl(owner: string, gistId: string, file: string): Promise<string> {
  const token = process.env["GITHUB_TOKEN"] ?? process.env["GIST_TOKEN"];
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };

  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  try {
    const apiUrl = `${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId)}`;
    const response = await fetch(apiUrl, { headers, cache: "force-cache" });

    if (response.ok) {
      const data = (await response.json()) as GistResponse;
      const gistFile = data.files[file];

      if (gistFile?.raw_url) {
        return gistFile.raw_url;
      }
    }
  } catch {
    // fall through to raw URL fallback
  }

  return `${GITHUB_RAW_GIST_BASE}/${owner}/${gistId}/raw/${file}`;
}

/**
 * Resolves a GitHub Gist asset spec into a concrete URL and metadata.
 *
 * @param spec Parsed asset spec with provider "gist".
 * @returns Resolved asset ready for download.
 */
export async function resolveGist(spec: ParsedAssetSpec): Promise<ResolvedAsset> {
  const [owner, gistId] = spec.packageName.split("/");
  const file = spec.file ?? "";

  if (!owner || !gistId || !file) {
    throw new Error(`gist: invalid spec "${spec.raw}". Expected gist:owner/gistId/file.js`);
  }

  const url = await resolveGistUrl(owner, gistId, file);

  return {
    provider: "gist",
    packageName: spec.packageName,
    version: "latest",
    file,
    url,
    sourceLabel: `gist:${owner}/${gistId}/${file}`,
    options: spec.options,
    warnings: [],
  };
}
