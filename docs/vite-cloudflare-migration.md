# Vite and Cloudflare migration

## Architecture contract

Replace Next.js with React 19, Vite and TanStack Router. Use pnpm workspaces without Turborepo. Deploy static assets and an Elysia HTTP API in one Cloudflare Worker initially. Use native handlers for WebSocket upgrades and platform-specific bindings. Keep browser compilation in esbuild WASM and external modules in import maps. Preserve TypeScript workers and declaration cache. Use CodeMirror 6, Tailwind and shadcn/UAI.

Real Linux terminal and filesystem synchronization must use an authenticated isolated remote gateway, not paid Cloudflare containers or host shell execution in Workers. Disable automatic Vercel deployments until migration is validated.

## Migration gates

- [ ] Inventory Next imports, routes and server-only dependencies.
- [ ] Migrate browser entry, routing, assets and worker bundling.
- [ ] Replace API routes with Elysia and native Worker handlers; explicitly disable unsupported operations until remote gateway is ready.
- [ ] Update lockfile, shared CI, typecheck, tests and production build.
- [ ] Verify browser compilation, persistence, preview and Safari.
- [ ] Configure Cloudflare deployment and PR preview; remove Next only after parity.

Predecessor #11 is merged; #12 now targets main (verified 2026-11-27).

## Manage integration

Cross-project architecture: [Rodverse PR #262](https://github.com/rodverse/rodverse/pull/262).

- Shared feature entry: `src/browser/SandboxApp.tsx`. Standalone router consumes it; future remote exposes the same component. Workspace ID format validation is not authorization.
- Keep document-wide gesture listeners and root creation in standalone bootstrap. Before exposing, audit Playground navigation, viewport sizing, global CSS, worker asset URLs, and IndexedDB origin separation. The existing ownership redirect must not navigate the host document.
- Evaluate @module-federation/vite with Vite 8, pin compatible React/React DOM singleton versions with Manage, emit manifest and ESM expose, then verify hosted build and actual embedded smoke. Do not publish a production remote until these gates pass.
- No second editor, no paid containers, no new Runtime repository. Browser preview remains isolated from the host.

Status: shared feature extraction only; federation plugin, host wiring, CSS isolation and validation remain pending.

### Embedded mode groundwork

SandboxApp accepts embedded mode; Playground uses container dimensions, scopes global keyboard shortcuts to events originating in its root, avoids host redirects and disables legacy detached editor/terminal popups when embedded. Standalone defaults unchanged. The host must provide a bounded height. Global CSS/preflight, Radix portals, API origins, worker URLs and persistence isolation still require review before publishing a remote. Build/typecheck and browser smoke pending.

## Federation increment (2026-11-27)

Experimental `./App` now reuses SandboxApp with the Rod Module SDK. Embedded mode uses a Shadow DOM boundary, contained Radix portals, identity/workspace-scoped persistence and origin-safe workers/WASM. Browser shell does not probe a host PTY API or evaluate JavaScript in the host realm; use the isolated Preview REPL. Package `build` remains legacy Next until CDN/API parity is proven; `build:browser` and `build:module` are the verified migration paths.

CI builds standalone plus a SHA-addressed module, emits `rod-module.json` and official `mf-manifest.json`, retains two earlier bundles from the same PR/main lane, and uses the existing single PR preview. Cache headers distinguish mutable pointer and immutable artifacts. No production activation in Manage by default. The versioned SDK tarball comes from Rodverse's canonical package (`npm pack`); independent public package publishing is pending.

Local evidence and remaining gates: [canonical STATUS](https://github.com/rodverse/rodverse/blob/docs/module-federation-architecture/docs/module/federation/STATUS.md). Built standalone and actual Manage federation were exercised in Chromium with an iPhone-sized viewport, real CodeMirror, workers, esbuild WASM and preview logs; host identity/catalog mocked for this smoke. No Safari/physical iPhone or authenticated deployment claimed. Previous notes about CSS/portals/workers being pending describe the prior extraction-only increment; live Access/CORS, public SDK release, API/CDN parity, production rollback and VPS/Ports remain pending.
