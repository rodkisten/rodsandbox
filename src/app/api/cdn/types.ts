export type CacheMode = "none" | "short" | "normal" | "long" | "immutable";

export type OutputFormat = "js" | "text" | "json";

export type BundleMode = "raw" | "iife" | "esm" | "cjs";

export type AssetProvider = "auto" | "cdnjs" | "jsdelivr" | "npm" | "gist" | "github" | "url";

export type ResolvedProvider = Exclude<AssetProvider, "auto">;

export type CssTargetMode = "document" | "manual";

export type SpecOptions = {
   name?: string;
   namespace?: string;
   global?: string;
   minify?: boolean;
   removeComments?: boolean;
   provider?: AssetProvider;
   id?: string;
   target?: CssTargetMode;
   ref?: string;
   ext?: string;
};

export type ParsedAssetSpec = {
   raw: string;
   provider: AssetProvider;
   packageName: string;
   version: string | null;
   file: string | null;
   options: SpecOptions;
};

export type RequestOptions = {
   specs: ParsedAssetSpec[];
   cssSpecs: ParsedAssetSpec[];
   presets: string[];
   minify: boolean;
   removeComments: boolean;
   cacheMode: CacheMode;
   format: OutputFormat;
   bundleMode: BundleMode;
   combine: boolean;
   debug: boolean;
   globalName: string | null;
   expose: boolean;
   entry: string | null;
   platform: "browser" | "node";
   external: string[];
   bundleProvider: "esm.sh" | "jsdelivr";
   cssInject: boolean;
   cssTarget: CssTargetMode;
   cssId: string | null;
   metadata: boolean;
};

export type ResolvedAsset = {
   provider: ResolvedProvider;
   packageName: string;
   version: string;
   file: string;
   url: string;
   sourceLabel: string;
   options: SpecOptions;
   warnings: readonly string[];
};

export type AssetFailureStage = "resolve" | "download" | "minify" | "bundle" | "css";

export type AssetFailure = {
   stage: AssetFailureStage;
   sourceLabel: string;
   message: string;
   provider?: AssetProvider | ResolvedProvider;
   packageName?: string;
   version?: string | null;
   file?: string | null;
   url?: string;
};

export type AssetResolutionResult = {
   assets:  ResolvedAsset[];
   failures:  AssetFailure[];
};

export type BuiltBundle = {
   code: string;
   assets:  ResolvedAsset[];
   cssAssets:  ResolvedAsset[];
   cssStyleId: string | null;
   warnings: readonly string[];
   failures: AssetFailure[];
   cacheKey: string;
   cacheHit: boolean;
};

export type ProviderResolver = {
  readonly resolve: (spec: ParsedAssetSpec) => Promise<ResolvedAsset | readonly ResolvedAsset[]>;
};
