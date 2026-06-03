# Validation

Validated in this package revision:

```bash
cd /mnt/data/cdnwork
npx tsc --noEmit
```

Result: passed.

A generated IIFE bundle was also built through the `buildModuleBundle` pipeline using a mocked HTTP module and checked with Node:

```bash
npx tsx validate-output.ts > /tmp/output.js
node --check /tmp/output.js
```

Result: passed.

The generated output contained the default namespace assignment:

```js
globalThis.RodCDN = globalThis.RodCDN ?? {};
globalThis.RodCDN.virtual = globalThis.RodCDN.virtual ?? o;
```
