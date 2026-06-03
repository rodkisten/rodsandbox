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

## v1.4 CSS + metadata bundle support

This route can now serve JavaScript and CSS from the same request. CSS is always minified and emitted as a small runtime that creates a `<style>` element with stable metadata attributes.

### Package aliases

All of these are accepted for JavaScript packages:

```txt
pkg=lodash
package=lodash
pkgs=lodash,axios@latest
packages=lodash,axios@latest
libs=lodash,axios@latest
```

### CSS assets

Use `css`, `style`, or `styles`:

```txt
/api/cdn?package=lodash&css=highlight.js@11.11.1/styles/github-dark.min.css
/api/cdn?packages=shiki@4.2.0,lodash&styles=highlight.js@11.11.1/styles/github-dark.min.css,animate.css@latest/animate.min.css
```

CSS specs use the same provider syntax as JS specs:

```txt
css=cdnjs:highlight.js@11.11.1/styles/github-dark.min.css
css=npm:animate.css@latest/animate.min.css
css=gist:oirodolfo/GIST_ID/theme.css
```

### CSS injection modes

By default, CSS is injected into `document.head`:

```txt
css-target=document
```

For Shadow DOM, use manual mode and call the generated helper:

```txt
/api/cdn?css=highlight.js@11.11.1/styles/github-dark.min.css&css-target=manual
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
  data-rod-cdn-packages="highlight.js@11.11.1/styles/github-dark.min.css"
></style>
```

If the current document already has a CSP nonce on a `<script>` or `<style>`, the runtime reuses it.

### Metadata banner

Every JavaScript response includes a highlighted metadata banner by default:

```txt
metadata=true
metadata=false
```

The banner shows generated time, namespace, bundle mode, cache hit, cache key, JS assets, CSS assets, CSS target, and style ID.

### Combined userscript example

```js
// @require https://code.migos.club/api/cdn?package=lodash(n:Utils)&css=highlight.js@11.11.1/styles/github-dark.min.css&bundle=raw&global=RodCDN&css-target=manual&css-id=rod-hljs-theme
```

Then:

```js
RodCDN.injectStyles(document);
RodCDN.injectStyles(shadowRoot);
console.log(RodCDN.Utils);
```
