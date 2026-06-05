# Rod CDN API

A Next.js `app/api/cdn` route for userscript-friendly CDN bundles.

It supports plain CDN concatenation, presets, npm packages, cdnjs assets, jsDelivr fallback, GitHub files/folders, public/private gists, CSS injection, aggressive cache headers, global aliases and an esbuild pipeline for packages that ship `import` / `export`.

## Install

```bash
npm i esbuild
```

## Defaults

Rod CDN is intentionally userscript-first:

- `bundle=iife` by default.
- `global=RodCDN` by default.
- missing package versions resolve to `latest` by default.
- `provider=auto` tries `cdnjs -> jsdelivr -> npm`.
- CSS is always minified.
- metadata banners are enabled by default.

```txt
/api/cdn?pkg=lodash
```

is equivalent to a latest-version, IIFE, namespace-safe request:

```txt
/api/cdn?pkg=lodash@latest&bundle=iife&global=RodCDN&cache=immutable
```

## Basic usage

```txt
/api/cdn?pkg=lodash
/api/cdn?pkg=lodash(n:GlobalLodash)
/api/cdn?pkgs=jquery,axios@latest
/api/cdn?preset=highlight
```

Package aliases are accepted:

```txt
pkg=lodash
package=lodash
pkgs=lodash,axios
packages=lodash,axios
libs=lodash,axios
```

## Provider fallback

`auto` now uses a three-step fallback chain:

```txt
cdnjs -> jsdelivr -> npm
```

Examples:

```txt
/api/cdn?pkg=lodash
/api/cdn?pkg=jsdelivr:lodash
/api/cdn?pkg=npm:lodash
/api/cdn?pkg=cdnjs:highlight.js/highlight.min.js
```

Per-package provider override:

```txt
/api/cdn?pkg=lodash(provider:jsdelivr)
```

The metadata banner reports which provider won.

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
| `package` | repeated asset spec | Alias for `pkg`. |
| `pkgs` | comma-separated specs | Compact mode. |
| `packages` | comma-separated specs | Alias for `pkgs`. |
| `preset` | `highlight`, `html`, `utils`, `userscript` | Can be comma-separated or repeated. |
| `bundle` | `raw`, `iife`, `esm`, `cjs`, `true`, `false` | Defaults to `iife`. `true` means `iife`. |
| `format` | `js`, `text`, `json`, `iife`, `esm`, `cjs` | `iife/esm/cjs` act as bundle-format aliases and still return JS. |
| `bundle-format` | `iife`, `esm`, `cjs` | Explicit module output format. |
| `global` | global variable name | Defaults to `RodCDN`. |
| `entry` | package subpath | Example: `shiki/bundle/web`. |
| `cache` | `none`, `short`, `normal`, `long`, `immutable` | Controls HTTP cache headers. |
| `minify` | `true`, `false`, `1`, `0`, `yes`, `no` | Controls JS minification. CSS is always minified. |
| `remove-comments` | boolean alias | Controls legal comments and raw comment stripping. |
| `external` | comma list | Leaves packages external in esbuild mode. |
| `bundle-provider` | `esm.sh`, `jsdelivr` | Provider used for ESM/npm bundling. |
| `css`, `style`, `styles` | CSS asset specs | CSS is minified and injected by runtime. |

## Asset spec grammar

```txt
lodash
lodash@latest
lodash@4.17.21
lodash(n:GlobalLodash)
jsdelivr:lodash
npm:shiki@4.2.0
cdnjs:highlight.js/highlight.min.js
gist:owner/gistId/file.js(namespace:File,minify:false,remove-comments:false)
github:owner/repo@main/src/index.js
url:https://example.com/file.js
https://github.com/owner/repo/blob/main/src/index.js
https://raw.githubusercontent.com/owner/repo/main/src/index.js
```

Option aliases:

```txt
n:GlobalName
name:GlobalName
global:GlobalName
namespace:GlobalName
minify:false
remove-comments:false
provider:jsdelivr
ref:main
ext:js+mjs+cjs
```

## GitHub files and folders

Public GitHub files can be passed as direct URLs:

```txt
/api/cdn?pkg=https://github.com/owner/repo/blob/main/src/index.js
/api/cdn?pkg=https://raw.githubusercontent.com/owner/repo/main/src/index.js
```

Compact DSL:

```txt
/api/cdn?pkg=github:owner/repo@main/src/index.js
```

Folders are supported through GitHub's tree API:

```txt
/api/cdn?pkg=github:owner/repo@main/src
```

Folder imports default to JavaScript-like files:

```txt
.js, .mjs, .cjs
```

Customize folder extensions with `ext`:

```txt
/api/cdn?pkg=github:owner/repo@main/src(ext:js+mjs+cjs+ts)
/api/cdn?css=github:owner/repo@main/styles(ext:css)
```

For private GitHub repositories, configure `GITHUB_TOKEN`. The API uses it for GitHub metadata and raw file downloads when available.

## Presets

- `highlight`: highlight.js core plus common languages.
- `html`: React, React DOM, Solid and Lit HTML descriptors.
- `utils`: es-toolkit.
- `userscript`: Lucide, es-toolkit and highlight.js basics.

For ESM-heavy presets like `html` and `utils`, the default `bundle=iife` is usually what you want for classic userscripts.

## Runtime cache

The route writes cache files to:

- `process.env.CDN_CACHE_DIR`, when set.
- `/tmp/cdn-runtime-cache` on Vercel.
- `.next/cache/rod-cdn` locally.

Disk cache writes are best-effort, so a serverless write failure will not break the request.

## Default global namespace

By default, generated IIFE/module bundles expose modules under a single root namespace:

```txt
/api/cdn?pkg=shiki@4.2.0&entry=shiki/bundle/web
```

Output shape:

```js
globalThis.RodCDN.Shiki
```

You can change the root namespace with `global`:

```txt
/api/cdn?pkg=shiki@4.2.0&entry=shiki/bundle/web&global=MyCDN
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
/api/cdn?pkg=some-package&expose=false
```

or:

```txt
/api/cdn?pkg=some-package&global=none
```

## CSS + metadata bundle support

This route can serve JavaScript and CSS from the same request. CSS is always minified and emitted as a small runtime that creates a `<style>` element with stable metadata attributes.

### CSS assets

Use `css`, `style`, or `styles`:

```txt
/api/cdn?package=lodash&css=highlight.js/styles/github-dark.min.css
/api/cdn?packages=shiki@4.2.0,lodash&styles=highlight.js/styles/github-dark.min.css,animate.css/animate.min.css
```

CSS specs use the same provider syntax as JS specs:

```txt
css=cdnjs:highlight.js/styles/github-dark.min.css
css=jsdelivr:animate.css/animate.min.css
css=npm:animate.css/animate.min.css
css=gist:oirodolfo/GIST_ID/theme.css
css=github:owner/repo@main/styles(ext:css)
```

### CSS injection modes

By default, CSS is injected into `document.head`:

```txt
css-target=document
```

For Shadow DOM, use manual mode and call the generated helper:

```txt
/api/cdn?css=highlight.js/styles/github-dark.min.css&css-target=manual
```

```js
RodCDN.injectStyles();
RodCDN.injectStyles(document);
RodCDN.injectStyles(myShadowRoot);
```

### Style ID

The style ID is auto-generated from the minified CSS hash. You can override it:

```txt
css-id=rod-shiki-theme
style-id=rod-shiki-theme
```

Generated style tags include:

```html
<style
  id="rod-shiki-theme"
  data-rod-cdn="true"
  data-rod-cdn-hash="..."
  data-rod-cdn-packages="highlight.js/styles/github-dark.min.css"
></style>
```

If the current document already has a CSP nonce on a `<script>` or `<style>`, the runtime reuses it.

## Metadata banner and partial loads

Every JavaScript response includes a highlighted metadata banner by default:

```txt
metadata=true
metadata=false
```

The banner shows generated time, namespace, bundle mode, cache hit, cache key, JS assets, CSS assets, CSS target, style ID, warnings and failed assets. When some assets fail, the API still returns the assets that worked and adds a giant partial-load report in the banner.

The runtime also prints a compact console summary showing the namespace, expected globals, available globals, CSS style IDs and failed assets.

## Combined userscript example

```js
// @require https://code.migos.club/api/cdn?package=lodash(n:Utils)&css=highlight.js/styles/github-dark.min.css&global=RodCDN&css-target=manual&css-id=rod-hljs-theme
```

Then:

```js
RodCDN.injectStyles(document);
RodCDN.injectStyles(shadowRoot);
console.log(RodCDN.Utils);
```
