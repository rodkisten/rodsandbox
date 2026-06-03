# Validation

Validated in this package revision from `/mnt/data/cdnwork`:

```bash
npx tsc --noEmit
```

Result: passed.

A generated CSS-injection JavaScript output was also produced through the real `buildBundle` pipeline using a `data:text/css` CSS asset and checked with Node:

```bash
npx tsx validate-output.ts > /tmp/rod-cdn-css-output.js
node --check /tmp/rod-cdn-css-output.js
```

Result: passed.

The generated output contains:

```js
globalThis.RodCDN.injectStyles
```

and a top metadata banner with CSS asset metadata, cache key, cache hit status, CSS target, and style ID.
