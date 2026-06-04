import { NextResponse } from "next/server";
import { createCacheHeaders } from "./cache";
import { listPresets } from "./presets";
import { attachMetadataBanner } from "./metadata";
import type { BuiltBundle, RequestOptions } from "./types";

/**
 * Creates the final HTTP response in JS, text or JSON format.
 *
 * @param options Request options.
 * @param bundle Built bundle.
 * @returns Next.js response.
 */
export function createBundleResponse(options: RequestOptions, bundle: BuiltBundle): NextResponse {
  const cacheHeaders = createCacheHeaders(options.cacheMode);

  if (options.format === "json") {
    return NextResponse.json(
      {
        cacheHit: bundle.cacheHit,
        cacheKey: bundle.cacheKey,
        presets: listPresets(),
        warnings: bundle.warnings,
        failures: bundle.failures,
        assets: bundle.assets,
        cssAssets: bundle.cssAssets,
        code: attachMetadataBanner(options, bundle),
      },
      { headers: cacheHeaders },
    );
  }

  return new NextResponse(attachMetadataBanner(options, bundle), {
    headers: {
      ...cacheHeaders,
      "Content-Type": options.format === "text" ? "text/plain; charset=utf-8" : "application/javascript; charset=utf-8",
      "X-Rod-CDN-Cache-Hit": String(bundle.cacheHit),
      "X-Rod-CDN-Cache-Key": bundle.cacheKey,
      "X-Rod-CDN-Warnings": bundle.warnings.join(" | ").slice(0, 500),
      "X-Rod-CDN-Failures": bundle.failures.map((failure) => `${failure.stage}:${failure.sourceLabel}`).join(" | ").slice(0, 1000),
      "X-Rod-CDN-Assets": bundle.assets.map((asset) => asset.sourceLabel).join(",").slice(0, 1500),
      "X-Rod-CDN-CSS-Assets": bundle.cssAssets.map((asset) => asset.sourceLabel).join(",").slice(0, 1500),
    },
  });
}

/**
 * Creates a structured error response.
 *
 * @param error Unknown caught error.
 * @returns JSON error response.
 */
export function createErrorResponse(error: unknown): NextResponse {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Unknown CDN route error",
    },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
