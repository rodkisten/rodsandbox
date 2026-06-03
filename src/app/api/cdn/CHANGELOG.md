# Changelog

## 1.2.0

- Added esbuild module bundling for ESM packages with `bundle=iife`, `bundle=esm` and `bundle=cjs`.
- Added `entry`, `global`, `external`, `platform` and `bundle-provider` query options.
- Added support for `format=iife`, `format=esm` and `format=cjs` as convenience aliases.
- Fixed explicit-version npm packages so `pkg=shiki@4.2.0` does not need the registry latest endpoint.
- Improved presets for ESM-first packages like Solid, Lit and es-toolkit.
- Added local runtime validation for HTTP import resolution and IIFE global assignment.

## 1.1.0

- Fixed npm latest resolution for packages whose `/latest` payload does not expose `dist-tags.latest`.
- Added safer Vercel runtime cache fallback to `/tmp`.
- Added cdnjs-to-npm fallback for auto provider mode.

## 1.3.0 - Namespace-safe IIFE globals

- Added `RodCDN` as the default root namespace for exposed modules.
- Added `global=<name>` support to change the root namespace, for example `global=MyCDN`.
- Added `global=none` / `global=false` and `expose=false` support for side-effect-only bundles.
- Updated IIFE module bundling so every bundled package is assigned to `globalThis[global][packageKey]` instead of polluting `globalThis` with one variable per package.
- Updated raw UMD asset handling so known globals are copied into the configured namespace when possible.

## 1.4.0 - CSS assets, package aliases and metadata banner

- Added `package` as a single-package alias and kept `packages` for comma-separated package lists.
- Added CSS asset support through `css`, `style`, and `styles` query parameters.
- Added same-provider CSS resolution for `cdnjs:`, `npm:`, `gist:`, and automatic cdnjs-to-npm fallback.
- Added always-on CSS minification through esbuild's CSS loader.
- Added a generated CSS runtime with `RodCDN.injectStyles(target?)` for document and ShadowRoot injection.
- Added `css-target=document|manual`, `css-id`, `style-id`, `css-inject`, and `style-inject` options.
- Added stable style metadata attributes: `data-rod-cdn`, `data-rod-cdn-hash`, and `data-rod-cdn-packages`.
- Added CSP nonce reuse from existing document scripts/styles when available.
- Added a highlighted metadata banner at the top of JS/text/JSON code output.
- Kept generated metadata outside disk cache so `cacheHit` stays accurate per request.
