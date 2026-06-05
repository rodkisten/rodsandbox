# Validation

Validated locally in the sandbox after the v1.6.0 changes.

## Commands

```bash
npx tsc -p tsconfig.validation.json
npx tsx /mnt/data/cdn_work/validate-parser.ts
npx tsx /mnt/data/cdn_work/validate-output.ts > /mnt/data/cdn_work/output.js
node --check /mnt/data/cdn_work/output.js
```

## Notes

- The sandbox does not include the consuming Next.js app dependencies, so `tsconfig.validation.json` used temporary local declaration stubs for `next/server`, Node built-ins and `esbuild`.
- Temporary validation files were not included in the final ZIP.
- The parser validation confirmed `package`, `packages`, GitHub URL specs and the new default `bundle=iife` behavior.
- The output validation generated a metadata-bearing JavaScript response and checked it with `node --check`.
