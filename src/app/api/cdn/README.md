# Rod CDN API

A Next.js `app/api/cdn` route for userscript-friendly CDN bundles.

It supports plain CDN concatenation, presets, npm packages, cdnjs assets, public/private gists, aggressive cache headers, global aliases and an esbuild pipeline for packages that ship `import` / `export`.

## Install

```bash
npm i esbuild
```

## Basic usage

```txt
/api/cdn?pkg=lodash
/api/cdn?pkg=lodash(n:GlobalLodash)
/api/cdn?pkgs=jquery@3.7.1,axios@latest
/api/cdn?preset=highlight
```

## ESM packages as IIFE globals

Use this when a package contains ESM imports/exports but you need a userscript-style global.

```txt
/api/cdn?pkg=shiki@4.2.0&entry=shiki/bundle/web&bundle=iife&global=Shiki&cache=immutable&minify=true
```

Userscript:

```js
// @require https://code.migos.club/api/cdn?pkg=shiki@4.2.0&entry=shiki/bundle/web&bundle=iife&global=Shiki&cache=immutable&minify=true
```

`entry` accepts both `bundle/web` and `shiki/bundle/web`. If the package name is included, the route strips it before generating the provider URL.

## Query params

| Param | Values | Notes |
|---|---|---|
| `pkg` | repeated asset spec | Recommended for long lists. |
| `pkgs` | comma-separated specs | Compact mode. |
| `preset` | `highlight`, `html`, `utils`, `userscript` | Can be comma-separated or repeated. |
| `bundle` | `raw`, `iife`, `esm`, `cjs`, `true`, `false` | `true` means `iife`. |
| `format` | `js`, `text`, `json`, `iife`, `esm`, `cjs` | `iife/esm/cjs` act as bundle-format aliases and still return JS. |
| `bundle-format` | `iife`, `esm`, `cjs` | Explicit module output format. |
| `global` | global variable name | Used by the first package in bundled mode. |
| `entry` | package subpath | Example: `shiki/bundle/web`. |
| `cache` | `none`, `short`, `normal`, `long`, `immutable` | Controls HTTP cache headers. |
| `minify` | `true`, `false`, `1`, `0`, `yes`, `no` | Controls esbuild minification. |
| `remove-comments` | boolean alias | Controls legal comments and raw comment stripping. |
| `external` | comma list | Leaves packages external in esbuild mode. |
| `bundle-provider` | `esm.sh`, `jsdelivr` | Provider used for ESM/npm bundling. |

## Asset spec grammar

```txt
lodash
lodash@latest
lodash@4.17.21
lodash(n:GlobalLodash)
npm:shiki@4.2.0
cdnjs:highlight.js@11.11.1/highlight.min.js
gist:owner/gistId/file.js(namespace:File,minify:false,remove-comments:false)
```

Option aliases:

```txt
n:GlobalName
name:GlobalName
global:GlobalName
namespace:GlobalName
minify:false
remove-comments:false
provider:npm
```

## Presets

- `highlight`: highlight.js core plus common languages.
- `html`: React, React DOM, Solid and Lit HTML descriptors.
- `utils`: es-toolkit.
- `userscript`: Lucide, es-toolkit and highlight.js basics.

For ESM-heavy presets like `html` and `utils`, prefer `bundle=iife` when you need classic userscript globals.

## Runtime cache

The route writes cache files to:

- `process.env.CDN_CACHE_DIR`, when set.
- `/tmp/cdn-runtime-cache` on Vercel.
- `.next/cache/rod-cdn` locally.

Disk cache writes are best-effort, so a serverless write failure will not break the request.

## Default global namespace

By default, generated IIFE/module bundles expose modules under a single root namespace:

```txt
/api/cdn?pkg=shiki@4.2.0&entry=shiki/bundle/web&bundle=iife
```

Output shape:

```js
globalThis.RodCDN.Shiki
```

You can change the root namespace with `global`:

```txt
/api/cdn?pkg=shiki@4.2.0&entry=shiki/bundle/web&bundle=iife&global=MyCDN
```

Output shape:

```js
globalThis.MyCDN.Shiki
```

You can choose the property name per package:

```txt
/api/cdn?pkg=lodash(n:GlobalLodash)&global=RodCDN
```

Output shape:

```js
globalThis.RodCDN.GlobalLodash
```

For side-effect-only bundles, disable exposure:

```txt
/api/cdn?pkg=some-package&bundle=iife&expose=false
```

or:

```txt
/api/cdn?pkg=some-package&bundle=iife&global=none
```
