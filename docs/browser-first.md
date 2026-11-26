# Browser-first sandbox

The browser worker compiles local modules with esbuild-wasm; external browser-compatible modules use pinned ESM CDN URLs and import maps. No automatic server bundling fallback or paid container provisioning. Unsupported Node APIs must produce explicit diagnostics.

The optional real terminal uses an existing authenticated Linux host through a gateway, with an isolated workspace, resource limits and no host credentials. No paid provider is provisioned automatically.

Workspace synchronization: persistent local journal, per-file revisions, acknowledgements, reconnect reconciliation, explicit conflicts, binary support, and remote watcher. Exclude node_modules, .git and build caches; preserve editor selection and undo. Remote execution must remain optional and must not block browser builds.

Deployment: manual Vercel deployments only. Validate typecheck and browser behavior, including Safari, before release.
