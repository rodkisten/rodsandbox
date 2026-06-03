export type CacheMode = "none" | "short" | "normal" | "long" | "immutable";

export type OutputFormat = "js" | "text" | "json";

export type BundleMode = "raw" | "iife" | "esm" | "cjs";

export type AssetProvider = "auto" | "cdnjs" | "npm" | "gist";

export type ResolvedProvider = Exclude<AssetProvider, "auto">;

export type SpecOptions = {
  readonly name?: string;
  readonly namespace?: string;
  readonly global?: string;
  readonly minify?: boolean;
  readonly removeComments?: boolean;
  readonly provider?: AssetProvider;
};

export type ParsedAssetSpec = {
  readonly raw: string;
  readonly provider: AssetProvider;
  readonly packageName: string;
  readonly version: string | null;
  readonly file: string | null;
  readonly options: SpecOptions;
};

export type RequestOptions = {
  readonly specs: readonly ParsedAssetSpec[];
  readonly presets: readonly string[];
  readonly minify: boolean;
  readonly removeComments: boolean;
  readonly cacheMode: CacheMode;
  readonly format: OutputFormat;
  readonly bundleMode: BundleMode;
  readonly combine: boolean;
  readonly debug: boolean;
  readonly globalName: string | null;
  readonly entry: string | null;
  readonly platform: "browser" | "node";
  readonly external: readonly string[];
  readonly bundleProvider: "esm.sh" | "jsdelivr";
};

export type ResolvedAsset = {
  readonly provider: ResolvedProvider;
  readonly packageName: string;
  readonly version: string;
  readonly file: string;
  readonly url: string;
  readonly sourceLabel: string;
  readonly options: SpecOptions;
  readonly warnings: readonly string[];
};

export type BuiltBundle = {
  readonly code: string;
  readonly assets: readonly ResolvedAsset[];
  readonly warnings: readonly string[];
  readonly cacheKey: string;
  readonly cacheHit: boolean;
};

export type ProviderResolver = {
  readonly resolve: (spec: ParsedAssetSpec) => Promise<ResolvedAsset>;
};
