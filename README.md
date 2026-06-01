# Rod CDN API

A compact Next.js route for loading userscript-friendly bundles from cdnjs, npm/jsDelivr and GitHub Gists.

Version 1.1.0 fixes provider-less package resolution, npm `latest` resolution, scoped package parsing, fragile comment removal and minification failures.

It supports:

- `preset=highlight`, `preset=html`, `preset=utils`, `preset=userscript`
- `pkg=lodash`, `pkg=lodash@latest`, `pkg=lodash@4.17.21/lodash.min.js`
- `pkg=cdnjs:highlight.js@11.11.1/highlight.min.js`
- `pkg=npm:lucide@0.468.0/dist/umd/lucide.js(n:Lucide)`
- `pkg=gist:owner/gistId/file.js(namespace:File,minify:false,remove-comments:false)`
- `minify=true|false|1|0|yes|no|on|off`
- `remove-comments=true|false` defaults to `false` because vendor bundles can contain tricky regex/template syntax
- `cache=none|short|normal|long|immutable`
- `format=js|text|json`
- `bundle=raw|iife`

## Install

```bash
npm i esbuild
```

## Folder placement

Copy this whole folder into your Next.js App Router project:

```txt
app/api/cdn/
  route.ts
  bundler.ts
  cache.ts
  comments.ts
  constants.ts
  globals.ts
  parser.ts
  presets.ts
  response.ts
  types.ts
  providers/
    cdnjs.ts
    gist.ts
    index.ts
    npm.ts
  examples/
    userscript-require.user.js
    devtools-require.user.js
```

## Basic usage

Provider-less specs use `auto`: the route tries cdnjs first and falls back to npm/jsDelivr.

```txt
/api/cdn?pkg=lodash
/api/cdn?pkg=lodash@4.17.21/lodash.min.js
/api/cdn?pkgs=jquery,axios@latest
```

## Multiple `pkg` params

```txt
/api/cdn?pkg=lucide@0.468.0/dist/umd/lucide.js&pkg=lodash(n:GlobalLodash)
```

## Presets

```txt
/api/cdn?preset=highlight
/api/cdn?preset=html
/api/cdn?preset=utils
/api/cdn?preset=userscript
```

Presets are intentionally normal specs under the hood, so they can be combined with custom packages:

```txt
/api/cdn?preset=userscript&pkg=lodash(n:GlobalLodash)
```

## Global aliases

Use `n`, `name` or `global` to rename a known global after the script loads.

```txt
/api/cdn?pkg=lodash(n:GlobalLodash)
```

This emits:

```js
globalThis["GlobalLodash"] = globalThis["GlobalLodash"] ?? globalThis["_"];
```

Known automatic aliases include:

- `lodash` → `_`
- `jquery` → `jQuery`
- `react` → `React`
- `react-dom` → `ReactDOM`
- `highlight.js` → `hljs`
- `lucide` → `lucide`
- `eruda` → `eruda`

## Gist support

Public gist:

```txt
/api/cdn?pkg=gist:oirodolfo/GIST_ID/file.js
```

Private gist:

```bash
GITHUB_TOKEN=ghp_xxx
# or
GIST_TOKEN=ghp_xxx
```

Then:

```txt
/api/cdn?pkg=gist:oirodolfo/GIST_ID/file.js(namespace:File,minify:false,remove-comments:false)
```

The API first tries the GitHub Gist API. If that fails, it falls back to the public raw gist URL.

## Userscript `@require`

```js
// @require https://your-domain.com/api/cdn?preset=userscript&pkg=lodash(n:GlobalLodash)&cache=immutable&minify=true
```

## HTML preset caveat

The `html` preset includes React, ReactDOM, Solid and Lit HTML. React and ReactDOM have classic global builds. Some npm packages are ESM-first, especially Lit-related files, and classic userscript `@require` works best with UMD/IIFE/global builds. If a response contains an ESM-first warning, inspect the JSON format first:

```txt
/api/cdn?preset=html&format=json
```

## Debugging

Use JSON format:

```txt
/api/cdn?preset=userscript&format=json
```

Use text format to inspect the generated bundle directly:

```txt
/api/cdn?preset=userscript&format=text&minify=false&remove-comments=false
```

## Runtime resilience

If `minify=true` but esbuild cannot parse one third-party file, the route now returns the unminified bundle with an `X-Rod-CDN-Warnings` header instead of failing the whole request.

If any individual asset has `minify:false`, final bundle minification is skipped to preserve source semantics.

## Cache behavior

The route stores generated bundles in:

```txt
.next/cache/rod-cdn
```

In serverless, this filesystem cache may disappear between cold starts. Browser/CDN headers still help a lot. For a heavier production version, replace `cache.ts` with Redis, Vercel KV, R2 or S3.

## Security notes

This route downloads and serves third-party JavaScript. Keep it private or restrict it if you use private gists or internal assets. Never expose a route that can fetch arbitrary full URLs without allowlists.
