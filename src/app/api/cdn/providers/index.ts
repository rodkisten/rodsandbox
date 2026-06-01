import { resolveCdnjs } from "./cdnjs";
import { resolveGist } from "./gist";
import { resolveNpm } from "./npm";
import type { ParsedAssetSpec, ResolvedAsset } from "../types";

/**
 * Resolves a list of parsed asset specs into concrete download-ready assets.
 *
 * @param specs Parsed asset specs from the request.
 * @returns Resolved assets in the same order.
 */
export async function resolveAssets(specs: readonly ParsedAssetSpec[]): Promise<readonly ResolvedAsset[]> {
  return Promise.all(
    specs.map((spec) => {
      switch (spec.provider) {
        case "cdnjs":
          return resolveCdnjs(spec);
        case "npm":
          return resolveNpm(spec);
        case "gist":
          return resolveGist(spec);
        default: {
          const exhaustive: never = spec.provider;
          throw new Error(`Unknown provider: ${exhaustive}`);
        }
      }
    }),
  );
}
