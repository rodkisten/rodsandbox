import { resolveCdnjs } from "./cdnjs";
import { resolveGist } from "./gist";
import { resolveGitHub } from "./github";
import { resolveJsdelivr } from "./jsdelivr";
import { resolveNpm } from "./npm";
import { resolveUrl } from "./url";
import type { AssetFailure, AssetResolutionResult, ParsedAssetSpec, ResolvedAsset } from "../types";

/**
 * Converts an unknown error into a stable user-facing message.
 *
 * @param error Unknown caught error.
 * @returns Readable error message.
 *
 * @example
 * ```ts
 * stringifyError(new Error("boom"));
 * // "boom"
 * ```
 */
function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider resolution error";
}

/**
 * Creates a structured failure for a spec that could not be resolved.
 *
 * @param spec Parsed asset spec that failed.
 * @param error Unknown caught error.
 * @returns Structured asset failure.
 */
function createResolveFailure(spec: ParsedAssetSpec, error: unknown): AssetFailure {
  return {
    stage: "resolve",
    sourceLabel: spec.raw,
    provider: spec.provider,
    packageName: spec.packageName,
    version: spec.version,
    file: spec.file,
    message: stringifyError(error),
  };
}

/**
 * Normalizes provider results into a flat asset list.
 *
 * @param value Provider result.
 * @returns Flat resolved asset list.
 */
function flattenResolvedAssets(value: ResolvedAsset | ResolvedAsset[]): ResolvedAsset[] {
  if (Array.isArray(value)) {
    return value as ResolvedAsset[];
  }

  return [value as ResolvedAsset];
}

/**
 * Resolves one parsed asset spec into concrete download-ready assets.
 *
 * @remarks
 * `auto` tries cdnjs first, then jsDelivr, then the npm resolver. jsDelivr and npm both use the
 * npm registry for latest-version resolution, but keeping both in the chain gives the metadata banner
 * an honest provider trail and leaves room for npm-specific resolver behavior later.
 *
 * @param spec Parsed asset spec from the request.
 * @returns One or more resolved assets.
 */
async function resolveAsset(spec: ParsedAssetSpec): Promise<readonly ResolvedAsset[]> {
  switch (spec.provider) {
    case "cdnjs":
      return flattenResolvedAssets(await resolveCdnjs(spec));
    case "jsdelivr":
      return flattenResolvedAssets(await resolveJsdelivr(spec));
    case "npm":
      return flattenResolvedAssets(await resolveNpm(spec));
    case "gist":
      return flattenResolvedAssets(await resolveGist(spec));
    case "github":
      return flattenResolvedAssets(await resolveGitHub(spec));
    case "url":
      return flattenResolvedAssets(await resolveUrl(spec));
    case "auto": {
      const errors: string[] = [];

      for (const resolver of [resolveCdnjs, resolveJsdelivr, resolveNpm] as const) {
        try {
          return flattenResolvedAssets(await resolver(spec));
        } catch (error) {
          errors.push(stringifyError(error));
        }
      }

      throw new Error(`All automatic providers failed for ${spec.raw}: ${errors.join(" | ")}`);
    }
    default: {
      const exhaustive: never = spec.provider;
      throw new Error(`Unknown provider: ${exhaustive}`);
    }
  }
}

/**
 * Resolves a list of parsed asset specs into concrete download-ready assets.
 *
 * @remarks
 * This function is intentionally tolerant: one bad package should not kill the whole bundle.
 * Failed specs are returned as structured failures and successful assets keep their original order.
 *
 * @param specs Parsed asset specs from the request.
 * @returns Successful assets plus structured failures.
 */
export async function resolveAssets(specs:  ParsedAssetSpec[]): Promise<AssetResolutionResult> {
  const settled = await Promise.allSettled(specs.map(resolveAsset));
  const assets: ResolvedAsset[] = [];
  const failures: AssetFailure[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      assets.push(...result.value);
      return;
    }

    failures.push(createResolveFailure(specs[index]!, result.reason));
  });

  return { assets, failures };
}
