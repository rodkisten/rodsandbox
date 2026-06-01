# Validation

## Structural validation

- Package contains the full route under `app/api/cdn`.
- Package contains examples, README and CHANGELOG.
- Package contains no placeholder-only files.

## Typecheck

I attempted to run:

```bash
tsc --noEmit
```

The sandbox used to generate this ZIP does not have the project dependencies installed in a real Next.js workspace, so it cannot fully resolve `next/server`, `esbuild`, or Node typings locally. The included `package.json` declares the required dependencies:

```bash
npm install
npm run typecheck
```

## Runtime fixes included in v1.1.0

The package was updated to address these production errors:

```txt
npm: no latest dist-tag for es-toolkit
npm: no latest dist-tag for solid-js
Transform failed with unterminated string literal
cdnjs: failed to resolve lodash: 404
Failed to download axios@latest/axios.min.js: 404
```

The route now resolves `latest` through jsDelivr package metadata first, defaults provider-less packages to `auto`, falls back from cdnjs to npm, and returns unminified code with warnings if esbuild cannot safely minify a vendor bundle.
