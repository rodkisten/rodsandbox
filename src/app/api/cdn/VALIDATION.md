# Validation

Validated in the sandbox with:

```bash
npx tsc -p tsconfig.validation.json
npx tsx validation-runtime-local.ts
```

Results:

```json
{
  "typecheck": "passed",
  "local_esbuild_bundle_smoke_test": "passed",
  "local_esbuild_bundle_result": {
    "codeLength": 539,
    "hasGlobal": true,
    "hasAnswer": true
  }
}
```

A live Shiki network smoke test was attempted, but the sandbox had transient DNS failure against public hosts. The code path itself was validated with a local HTTP module graph using relative imports.
