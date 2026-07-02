# RodSandbox Bundle API

Server-side upload bundling for iPhone Shortcuts, Scriptable, or the `/bundle` upload page.

## Routes

- `GET /bundle`: mobile-friendly upload UI.
- `GET /api/bundle`: small JSON help response.
- `POST /api/bundle`: multipart upload that returns a downloadable JavaScript bundle.

## Multipart fields

| Field | Required | Notes |
|---|---:|---|
| `file` | yes | `.zip` project or single `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` file. |
| `entry` | no | Explicit entry for zip uploads, for example `src/index.ts`. |
| `format` | no | `iife`, `esm`, or `cjs`. Default: `iife`. |
| `global` / `globalName` | no | IIFE global name. Default: `RodBundle`. |
| `platform` | no | `browser`, `node`, or `neutral`. Default: `browser`. |
| `target` | no | esbuild target. Default: `es2020`. |
| `minify` | no | Boolean-ish value. Default: `false`. |
| `external` | no | Comma-separated package list to leave external. |

## Entry detection for ZIPs

The API first checks `package.json` fields such as `source`, `module`, `browser`, `main`, and `exports`.

If none match, it searches common names including:

```txt
index.ts, bundle.ts, main.ts,
src/index.ts, src/bundle.ts, src/main.ts,
and the same names with .tsx/.js/.jsx/.mjs/.cjs
```

Extensionless candidates such as `src/index` are resolved against supported source extensions.

## Dependency install

When the uploaded zip contains a `package.json`, the server installs dependencies before bundling:

1. `pnpm install --frozen-lockfile=false --prefer-offline` when `pnpm-lock.yaml` and `pnpm` are available.
2. `yarn install` when `yarn.lock` and `yarn` are available.
3. `npm install --include=dev` as fallback.

Single-file uploads skip dependency installation.

## Shortcut shape

Use a `POST` request with `multipart/form-data` to `/api/bundle`, attach your selected file as `file`, then save the response body as a `.js` file.
