# Changelog

## [0.4.0] - 2026-05-30

### Added
- **Auth system** — placeholder auth service (`src/lib/auth.ts`) with `signIn`/`signOut`/`getSession`/`isAuthenticated`. Demo credentials `demo`/`demo`. Session stored in `localStorage`.
- **AuthContext + useAuth hook** — React context wiring auth state. Uses lazy `useState` initializer (no async hydration).
- **Login page** (`/login`) — polished form with demo credential hint.
- **Multi-workspace architecture** — `User`, `AuthSession`, `WorkspaceSummary` types. `listWorkspaceSummaries(ownerId?)` in IndexedDB layer. DB version bumped to 2.
- **Workspace picker** (`/workspaces`) — create, open, delete workspaces. Auth-protected.
- **Protected IDE route** (`/w/[workspaceId]`) — gated by auth; passes `workspaceId` to Playground.
- **Terminal adapter pattern** (`src/services/terminal/adapter.ts`) — `TerminalAdapter` interface, `VercelFallbackAdapter` (serverless-safe), `LocalTerminalAdapter` (stub for node-pty), `createTerminalAdapter()` factory with runtime auto-detection.
- **Terminal API stub** (`src/app/api/terminal/route.ts`) — 501 response with TODO comments.
- **TerminalPanel + XTermInner components** — xterm.js v5, dynamic import (SSR disabled), midnight theme, fit-addon.
- **GitService** (`src/services/git/gitService.ts`) — full isomorphic-git + LightningFS implementation. Supports: init, status, fileStatus, stageFile, stageAll, unstageFile, commit, log, branches, currentBranch, createBranch, checkout, remotes, addRemote, diff. `syncWorkspaceToFs` / `readFsToWorkspace` helpers.
- **GitPanel** — full git operations UI (status/log/branches tabs, stage/unstage, commit form, branch management).
- **GitDiffViewer** — unified diff viewer with add/remove/context line coloring.
- **New CSS design tokens** — `--surface-0/1/2/3`, `--border-subtle/default/strong`, `--accent`, `--status-*`, `--safe-top/bottom/left/right`, `--font-mono/sans`, `--transition-fast/base`, `.glass`, `.safe-area-full`.
- **iOS zoom fix** — `font-size: 16px !important` on `input`, `textarea`, `select` (replaces broken `transform: scale(0.75)` hack).
- **Feature flags** — `ENABLE_AUTH`, `ENABLE_TERMINAL`, `ENABLE_GIT`, `ENABLE_WORKSPACES`.
- **New types** — `GitStatusEntry`, `GitCommit`, `GitBranch`, `GitRemote`, `GitDiff`/`GitDiffHunk`/`GitDiffLine`, `TerminalRuntimeInfo`.
- **i18n keys** — `tabs.terminal`, `tabs.git`.
- **Tests** — `auth.test.ts` (10 tests), `terminal-adapter.test.ts` (6 tests), `git-service.test.ts` (5 tests).
- **README** — full architecture, feature flags table, auth/terminal/git docs, deploy notes, theme reference, extension guide.

### Fixed
- Removed broken `transform: scale(0.75)` textarea hack in `globals.css`.
- Removed duplicate function definitions in `db.ts`.
- Removed invalid `viewportMargin` prop from `Editor.tsx` (CodeMirror 5 API).

## [0.3.0] - 2026-05-18

### Added
- Phase 3 foundations:
  - Extended plugin registry with typed plugin contexts and enable/disable/error isolation
  - REPL core manager and REPL panel with command history and built-in commands
  - Command palette modal with keyboard navigation and command filtering
  - i18n helper foundation (`t()` key lookup)
  - Service worker registration utility and client bootstrap component
  - Plugin wiring hooks in Playground for editor/compiler/preview/repl/logs contributions
  - REPL iframe evaluation bridge (`REPL_EVAL`/`REPL_RESULT`) in preview sandbox
- Tests:
  - `plugin-registry.test.ts`
  - `repl.test.ts`
  - `i18n.test.ts`
  - `command-palette.test.tsx`

## [0.2.0] - 2026-05-18

### Added
- Browser TypeScript compiler service
- Prettier formatter support
- Diagnostics panel wiring
- Download/export helpers

## [0.1.0] - 2026-05-18

### Added
- Initial Next.js playground shell with file tree, CodeMirror editor, preview panel, logs, and IndexedDB persistence


## [0.4.0] - 2026-05-19

### Added
- Worker-first architecture foundation for heavy runtime tasks:
  - `bundler.worker.ts` for lazy-loaded browser bundling entrypoint
  - `formatter.worker.ts` for off-main-thread formatting
  - `ts-language.worker.ts` for TypeScript diagnostics requests
  - shared worker message contracts in `src/workers/messages.ts`
- New `EsbuildBundlerService` abstraction in `src/bundler/esbuildBundler.ts`.

### Notes
- esbuild wasm is loaded remotely inside the bundler worker to keep the app backend-free and avoid server dependencies.


## [0.5.0] - 2026-05-19

### Added
- Phase 2 completion block:
  - TS worker completions and quick-info APIs with idle lifecycle cleanup
  - CodeMirror integration for worker-backed autocomplete and hover quick-info
  - Diagnostics-to-editor line/column jump navigation
  - Unified workspace import flow for JSON and ZIP
  - Full-workspace replacement semantics for templates/import/snapshot restore
  - Dependency panel fed by bundler dependency extraction

### Changed
- Documentation updated to clarify implemented Phase 2 scope and remaining later-phase work.
