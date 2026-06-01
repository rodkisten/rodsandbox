# Validation

Generated structure:

- 18 files under `app/api/cdn`.
- Includes route, parser, presets, providers, cache, bundler, examples, README and CHANGELOG.

Local validation attempted:

```bash
tsc --noEmit --pretty false
```

Result in this sandbox:

```txt
error TS2688: Cannot find type definition file for 'node'.
```

Reason: this environment does not have the project dependencies installed. Install dependencies first:

```bash
npm i esbuild next typescript @types/node
npm run typecheck
```
