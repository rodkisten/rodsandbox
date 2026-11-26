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

Predecessor: PR #11. Retarget/reconcile against main after it merges, especially if squash merged.
