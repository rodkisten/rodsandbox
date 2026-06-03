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
