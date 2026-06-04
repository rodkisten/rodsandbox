import { resolveCdnjs } from "./cdnjs";
import { resolveGist } from "./gist";
import { resolveNpm } from "./npm";
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
 * Resolves one parsed asset spec into a concrete download-ready asset.
 *
 * @remarks
 * `auto` still tries cdnjs first and falls back to npm, preserving the existing behavior.
 * The caller decides whether a failure should abort the whole response or be reported as partial.
 *
 * @param spec Parsed asset spec from the request.
 * @returns Resolved asset.
 */
async function resolveAsset(spec: ParsedAssetSpec): Promise<ResolvedAsset> {
  switch (spec.provider) {
    case "cdnjs":
      return resolveCdnjs(spec);
    case "npm":
      return resolveNpm(spec);
    case "gist":
      return resolveGist(spec);
    case "auto":
      return resolveCdnjs(spec).catch(() => resolveNpm(spec));
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
export async function resolveAssets(specs: readonly ParsedAssetSpec[]): Promise<AssetResolutionResult> {
  const settled = await Promise.allSettled(specs.map(resolveAsset));
  const assets: ResolvedAsset[] = [];
  const failures: AssetFailure[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      assets.push(result.value);
      return;
    }

    failures.push(createResolveFailure(specs[index]!, result.reason));
  });

  return { assets, failures };
}
