# RodSandbox

Offline-first, browser-only code playground inspired by JSFiddle and CodeSandbox.

## Stack

- Next.js App Router + TypeScript
- CodeMirror 6 (no Monaco)
- IndexedDB (`idb`) for workspace persistence
- In-browser TypeScript compiler API
- Prettier standalone formatter
- iframe sandbox preview + postMessage bridge
- Vitest for core logic tests

## Architecture

```text
src/
  editor/        CodeMirror setup and extensions
  compiler/      Browser TypeScript compilation service
  preview/       iframe HTML builder and sandbox bridge
  repl/          REPL command manager
  logs/          Serialization and log presentation
  filesystem/    Virtual filesystem + tree shaping
  plugins/       Plugin registry and context APIs
  diagnostics/   Diagnostic normalization
  persistence/   IndexedDB helpers
  components/    UI (layout, panels, command palette)
  hooks/         App hooks (workspace + resizing)
  lib/           Utilities (download, i18n, service worker register)
```

## Plugin API (Phase 3)

Plugins register via `PluginRegistry` and receive a strongly-typed context:

- `context.editor.registerAutocompleteProvider(...)`
- `context.editor.registerCommand(...)`
- `context.editor.registerExtension(...)`
- `context.compiler.addVirtualTypeFile(...)`
- `context.preview.injectScript(...)`
- `context.repl.registerCommand(...)`
- `context.logs.registerFormatter(...)`

Errors are isolated per plugin (`RegisteredPlugin.error`) so one plugin failure does not break initialization.

## REPL

- Bottom panel REPL tab
- Command history (↑/↓)
- Built-ins: `.help`, `.commands`, `.clear`
- Non-dot input is evaluated in the sandboxed iframe only (`REPL_EVAL` postMessage)

## PWA

- `public/manifest.json`
- `public/sw.js` cache-first for static assets, network-first for navigation
- Service worker registration in `src/lib/registerSw.ts` and `src/app/sw-register.tsx`

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run build
npx vitest run
```

## Deploy to Vercel

Deploy directly as a standard Next.js App Router project.
No custom server is required.

## Current limits

- Phase 3 started: plugin APIs + REPL + command palette + PWA wiring are in place.
- Advanced plugin marketplace, shareable compressed URLs, and snapshot features are pending future phases.

