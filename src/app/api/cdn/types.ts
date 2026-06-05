export type CacheMode = "none" | "short" | "normal" | "long" | "immutable";

export type OutputFormat = "js" | "text" | "json";

export type BundleMode = "raw" | "iife" | "esm" | "cjs";

export type AssetProvider = "auto" | "cdnjs" | "jsdelivr" | "npm" | "gist" | "github" | "url";

export type ResolvedProvider = Exclude<AssetProvider, "auto">;

export type CssTargetMode = "document" | "manual";

export type SpecOptions = {
  readonly name?: string;
  readonly namespace?: string;
  readonly global?: string;
  readonly minify?: boolean;
  readonly removeComments?: boolean;
  readonly provider?: AssetProvider;
  readonly id?: string;
  readonly target?: CssTargetMode;
  readonly ref?: string;
  readonly ext?: string;
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
  readonly cssSpecs: readonly ParsedAssetSpec[];
  readonly presets: readonly string[];
  readonly minify: boolean;
  readonly removeComments: boolean;
  readonly cacheMode: CacheMode;
  readonly format: OutputFormat;
  readonly bundleMode: BundleMode;
  readonly combine: boolean;
  readonly debug: boolean;
  readonly globalName: string | null;
  readonly expose: boolean;
  readonly entry: string | null;
  readonly platform: "browser" | "node";
  readonly external: readonly string[];
  readonly bundleProvider: "esm.sh" | "jsdelivr";
  readonly cssInject: boolean;
  readonly cssTarget: CssTargetMode;
  readonly cssId: string | null;
  readonly metadata: boolean;
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

export type AssetFailureStage = "resolve" | "download" | "minify" | "bundle" | "css";

export type AssetFailure = {
  readonly stage: AssetFailureStage;
  readonly sourceLabel: string;
  readonly message: string;
  readonly provider?: AssetProvider | ResolvedProvider;
  readonly packageName?: string;
  readonly version?: string | null;
  readonly file?: string | null;
  readonly url?: string;
};

export type AssetResolutionResult = {
  readonly assets: readonly ResolvedAsset[];
  readonly failures: readonly AssetFailure[];
};

export type BuiltBundle = {
  readonly code: string;
  readonly assets: readonly ResolvedAsset[];
  readonly cssAssets: readonly ResolvedAsset[];
  readonly cssStyleId: string | null;
  readonly warnings: readonly string[];
  readonly failures: readonly AssetFailure[];
  readonly cacheKey: string;
  readonly cacheHit: boolean;
};

export type ProviderResolver = {
  readonly resolve: (spec: ParsedAssetSpec) => Promise<ResolvedAsset | readonly ResolvedAsset[]>;
};
