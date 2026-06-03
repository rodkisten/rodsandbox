import path from "node:path";
import type { CacheMode } from "./types";

export const CDNJS_API_BASE = "https://api.cdnjs.com/libraries";
export const CDNJS_ASSET_BASE = "https://cdnjs.cloudflare.com/ajax/libs";
export const JSDELIVR_NPM_BASE = "https://cdn.jsdelivr.net/npm";
export const ESM_SH_BASE = "https://esm.sh";
export const NPM_REGISTRY_BASE = "https://registry.npmjs.org";
export const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_RAW_GIST_BASE = "https://gist.githubusercontent.com";

export const CACHE_DIR = path.join(process.cwd(), ".next", "cache", "rod-cdn");

export const CACHE_SECONDS = {
  none: 0,
  short: 60 * 5,
  normal: 60 * 60,
  long: 60 * 60 * 24 * 7,
  immutable: 60 * 60 * 24 * 365,
} as const satisfies Record<CacheMode, number>;

export const TRUTHY = new Set(["1", "true", "yes", "on"]);
export const FALSY = new Set(["0", "false", "no", "off"]);
