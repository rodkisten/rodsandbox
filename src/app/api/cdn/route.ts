import { NextRequest, NextResponse } from "next/server";
import { buildBundle } from "./bundler";
import { expandPresets, listPresets } from "./presets";
import { resolveAssets } from "./providers";
import { parseRequestOptions } from "./parser";
import { createBundleResponse, createErrorResponse } from "./response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bundles CDN, npm and gist assets behind one userscript-friendly endpoint.
 *
 * @param request Next.js request.
 * @returns JavaScript, text or JSON response.
 *
 * @example
 * GET /api/cdn?preset=userscript&pkg=lodash(n:GlobalLodash)
 *
 * @example
 * GET /api/cdn?pkg=gist:oirodolfo/GIST_ID/file.js(namespace:File,minify:false,remove-comments:false)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const options = parseRequestOptions(request.nextUrl.searchParams);

    if (request.nextUrl.searchParams.get("help") === "true") {
      return NextResponse.json({ presets: listPresets() });
    }

    const presetSpecs = expandPresets(options.presets);
    const allSpecs = [...presetSpecs, ...options.specs];

    if (allSpecs.length === 0 && options.cssSpecs.length === 0) {
      throw new Error("Missing assets. Use ?preset=userscript, ?pkg=lodash, ?package=axios, ?pkgs=jquery,axios, or ?css=highlight.js/styles/github-dark.min.css.");
    }

    const [assets, cssAssets] = await Promise.all([resolveAssets(allSpecs), resolveAssets(options.cssSpecs)]);
    const bundle = await buildBundle(options, assets, cssAssets);

    return createBundleResponse(options, bundle);
  } catch (error) {
    return createErrorResponse(error);
  }
}
