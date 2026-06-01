# Changelog

## 1.1.0

- Fixed provider-less packages such as `pkg=lodash(n:GlobalLodash)` by adding an `auto` provider that tries cdnjs first and falls back to npm.
- Fixed `@latest` npm resolution for packages such as `es-toolkit` and `solid-js` by resolving latest through jsDelivr package metadata before falling back to the npm registry.
- Fixed scoped npm package parsing for names like `@scope/package@latest/file.js`.
- Made `remove-comments` default to `false` to avoid corrupting vendor bundles that contain tricky regex/template syntax.
- Added safe esbuild fallback: if minification cannot parse a third-party asset, the API now returns the unminified bundle with a warning instead of failing the request.
- Honored per-asset `minify:false` by skipping final bundle minification when any asset opts out.

## 1.0.0

- Initial `app/api/cdn` route with presets, cdnjs, npm, gist support, cache aliases, format aliases, minification and global aliases.
